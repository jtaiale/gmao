# Petit serveur HTTP statique en PowerShell pour le prototype GMAO.
# Sert les fichiers du dossier courant.

param(
  [int]$Port = 5173
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.htm'  = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.gif'  = 'image/gif'
  '.ico'  = 'image/x-icon'
  '.woff' = 'font/woff'
  '.woff2'= 'font/woff2'
  '.txt'  = 'text/plain; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)
$listener.Start()

Write-Host "GMAO prototype servi sur $prefix"
Write-Host "Racine: $root"
Write-Host "Ctrl+C pour arreter."

try {
  while ($listener.IsListening) {
    try {
      $ctx = $listener.GetContext()
    } catch {
      continue
    }
    $req = $ctx.Request
    $res = $ctx.Response

    try {
      $relativePath = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
      if ([string]::IsNullOrEmpty($relativePath)) { $relativePath = 'index.html' }

      $filePath = Join-Path $root $relativePath
      if ((Test-Path $filePath -PathType Container)) {
        $filePath = Join-Path $filePath 'index.html'
      }

      if (Test-Path $filePath -PathType Leaf) {
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
        $type = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
        $res.ContentType = $type
        $res.ContentLength64 = $bytes.Length
        $res.StatusCode = 200
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
        Write-Host "GET $relativePath -> 200 ($($bytes.Length) o)"
      } else {
        $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - $relativePath introuvable")
        $res.StatusCode = 404
        $res.ContentType = 'text/plain; charset=utf-8'
        $res.ContentLength64 = $msg.Length
        $res.OutputStream.Write($msg, 0, $msg.Length)
        Write-Host "GET $relativePath -> 404"
      }
    } catch {
      Write-Host "Erreur sur $($req.Url.AbsolutePath) : $($_.Exception.Message)"
    } finally {
      try { $res.OutputStream.Close() } catch { }
      try { $res.Close() } catch { }
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
