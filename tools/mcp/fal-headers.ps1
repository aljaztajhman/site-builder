# Auth header for the fal.ai MCP server (.mcp.json "headersHelper"). Claude Code runs this on each connection.
# Reads FAL_KEY from the process environment, falling back to the Windows user environment, so a key saved
# after the Claude app started works without restarting the app. Prints JSON only; never logs the key.
$key = $env:FAL_KEY
if (-not $key) { $key = [Environment]::GetEnvironmentVariable("FAL_KEY", "User") }
if (-not $key) {
  [Console]::Error.WriteLine("FAL_KEY is not set (user environment variable). See docs/research/image-generation.html.")
  Write-Output "{}"
  exit 0
}
Write-Output (@{ Authorization = "Bearer $key" } | ConvertTo-Json -Compress)
