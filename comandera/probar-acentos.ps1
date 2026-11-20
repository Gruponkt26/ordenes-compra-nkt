# Imprime la linea de acentos con 4 tablas de caracteres distintas, para ver cual es la que entiende la impresora.
# Sin instalar nada (solo PowerShell, que ya viene con Windows). Cada linea dice con que numero se imprimio.
#   probar-acentos.bat                 -> imprime en 192.168.1.222
#   probar-acentos.bat 192.168.1.50    -> en otra IP
param([string]$Ip = "192.168.1.222", [int]$Puerto = 9100)
$ErrorActionPreference = "Stop"
$a = [char]0xE1; $e = [char]0xE9; $i = [char]0xED; $o = [char]0xF3; $u = [char]0xFA; $eniemin = [char]0xF1; $eniemay = [char]0xD1
$ab = [char]0xBF; $ex = [char]0xA1; $gr = [char]0xB0
$frase = "$a $e $i $o $u $eniemin $eniemay $ab $ex $gr"

# Que byte lleva cada letra segun la familia de tablas: DOS (CP437/CP850/CP858) o Windows (WPC1252).
$dos = @{}; $dos[[int]$a]=0xA0; $dos[[int]$e]=0x82; $dos[[int]$i]=0xA1; $dos[[int]$o]=0xA2; $dos[[int]$u]=0xA3; $dos[[int]$eniemin]=0xA4; $dos[[int]$eniemay]=0xA5; $dos[[int]$ab]=0xA8; $dos[[int]$ex]=0xAD; $dos[[int]$gr]=0xF8
$win = @{}; $win[[int]$a]=0xE1; $win[[int]$e]=0xE9; $win[[int]$i]=0xED; $win[[int]$o]=0xF3; $win[[int]$u]=0xFA; $win[[int]$eniemin]=0xF1; $win[[int]$eniemay]=0xD1; $win[[int]$ab]=0xBF; $win[[int]$ex]=0xA1; $win[[int]$gr]=0xB0

$bytes = New-Object System.Collections.Generic.List[byte]
function Crudo([byte[]]$b) { $script:bytes.AddRange($b) }
function Linea([string]$t, $mapa) {
  foreach ($ch in $t.ToCharArray()) {
    $c = [int]$ch
    if ($mapa -ne $null -and $mapa.ContainsKey($c)) { $script:bytes.Add([byte]$mapa[$c]) }
    elseif ($c -lt 128) { $script:bytes.Add([byte]$c) }
    else { $script:bytes.Add([byte]63) }
  }
  $script:bytes.Add([byte]10)
}

Crudo @(0x1B,0x40)
Crudo @(0x1B,0x61,1); Crudo @(0x1D,0x21,0x11); Linea "ACENTOS" $null; Crudo @(0x1D,0x21,0x00); Crudo @(0x1B,0x61,0)
Linea "Mira cual linea se ve bien y avisa el numero." $null
Linea ("-" * 48) $null

# numero de tabla, nombre, familia de bytes
$variantes = @( @(19,"CP858",$dos), @(2,"CP850",$dos), @(0,"CP437",$dos), @(16,"WPC1252",$win) )
foreach ($v in $variantes) {
  Crudo @(0x1B,0x40)                    # reiniciar
  Crudo @(0x1C,0x2E)                    # apagar el modo de caracteres chinos (muchas termicas lo traen prendido)
  Crudo @(0x1B,0x74,[byte]$v[0])        # elegir la tabla
  Linea ("Numero " + $v[0] + " (" + $v[1] + "):") $null
  Linea ("   " + $frase) $v[2]
  Linea "" $null
}
Crudo @(0x1B,0x40)
Linea ("-" * 48) $null
Linea "Tambien: probar sin apagar el modo chino:" $null
Crudo @(0x1B,0x74,[byte]19)
Linea ("   " + $frase) $dos
Crudo @(0x1B,0x64,4); Crudo @(0x1D,0x56,0x42,0x00)

Write-Host ("Mandando a la impresora " + $Ip + ":" + $Puerto + " ...")
$cliente = New-Object System.Net.Sockets.TcpClient
try {
  $conexion = $cliente.BeginConnect($Ip, $Puerto, $null, $null)
  if (-not $conexion.AsyncWaitHandle.WaitOne(6000, $false)) { throw "No contesto en 6 segundos." }
  $cliente.EndConnect($conexion)
  $flujo = $cliente.GetStream(); $datos = $bytes.ToArray(); $flujo.Write($datos, 0, $datos.Length); $flujo.Flush()
  Start-Sleep -Milliseconds 800
  Write-Host "Listo. Mira la hoja: cual linea de acentos se ve bien? (avisame el numero)"
} catch {
  Write-Host ("No se pudo imprimir: " + $_.Exception.Message) -ForegroundColor Red; exit 1
} finally { $cliente.Close() }
