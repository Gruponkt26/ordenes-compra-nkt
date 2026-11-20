# Prueba de impresion SIN instalar nada: manda un ticket de prueba a la impresora termica por red (puerto 9100).
# Usa solo PowerShell, que ya viene con Windows. No cambia nada de la impresora ni de Maxirest: es un papel mas.
#   probar-cocina.bat                 -> imprime en 192.168.1.222
#   probar-cocina.bat 192.168.1.50    -> imprime en otra IP
# (Este archivo esta escrito solo con letras comunes a proposito: los acentos del ticket se arman con codigos.)
param([string]$Ip = "192.168.1.222", [int]$Puerto = 9100, [int]$Codepage = 19)
$ErrorActionPreference = "Stop"

# Las termicas no entienden UTF-8: cada acento va con el byte de su tabla de caracteres (CP858/CP850).
$a = [char]0xE1; $e = [char]0xE9; $i = [char]0xED; $o = [char]0xF3; $u = [char]0xFA; $eniemin = [char]0xF1; $eniemay = [char]0xD1
$ab = [char]0xBF; $ex = [char]0xA1; $gr = [char]0xB0
$tabla = @{}
$tabla[[int]$a] = 0xA0; $tabla[[int]$e] = 0x82; $tabla[[int]$i] = 0xA1; $tabla[[int]$o] = 0xA2; $tabla[[int]$u] = 0xA3
$tabla[[int]$eniemin] = 0xA4; $tabla[[int]$eniemay] = 0xA5; $tabla[[int]$ab] = 0xA8; $tabla[[int]$ex] = 0xAD; $tabla[[int]$gr] = 0xF8

$bytes = New-Object System.Collections.Generic.List[byte]
function Crudo([byte[]]$b) { $script:bytes.AddRange($b) }
function Linea([string]$t) {
  foreach ($ch in $t.ToCharArray()) {
    $c = [int]$ch
    if ($tabla.ContainsKey($c)) { $script:bytes.Add([byte]$tabla[$c]) }
    elseif ($c -lt 128) { $script:bytes.Add([byte]$c) }
    else { $script:bytes.Add([byte]63) }   # lo que no se conoce sale como "?"
  }
  $script:bytes.Add([byte]10)
}

Crudo @(0x1B,0x40)                  # iniciar
Crudo @(0x1B,0x74,[byte]$Codepage)  # tabla de caracteres
Crudo @(0x1B,0x61,1)                # centrado
Crudo @(0x1D,0x21,0x11)             # letra grande
Linea "PRUEBA"
Crudo @(0x1D,0x21,0x00)             # letra normal
Crudo @(0x1B,0x45,1)
Linea "El Bodeg${o}n NKT"
Crudo @(0x1B,0x45,0)
Crudo @(0x1B,0x61,0)                # a la izquierda
Linea ("-" * 48)
Linea ("Impresora " + $Ip + ":" + $Puerto)
Linea ("Hora: " + (Get-Date -Format "HH:mm"))
Linea ("-" * 48)
Linea ""
Crudo @(0x1B,0x45,1)
Linea "2x Provoleta NKT"
Linea "1x S${a}ndwich de jam${o}n crudo y r${u}cula"
Crudo @(0x1B,0x45,0)
Linea "   >> sin cebolla"
Linea ""
Linea "Acentos: ${a} ${e} ${i} ${o} ${u} ${eniemin} ${eniemay} ${ab} ${ex} ${gr}"
Linea ("-" * 48)
Linea "Si los acentos se ven bien, la prueba esta OK."
Linea "Si salen simbolos raros, probar con codepage 2:"
Linea "  probar-cocina.bat 192.168.1.222 2"
Crudo @(0x1B,0x64,4)                # avanzar papel
Crudo @(0x1D,0x56,0x42,0x00)        # cortar

Write-Host ("Mandando a la impresora " + $Ip + ":" + $Puerto + " ...")
$cliente = New-Object System.Net.Sockets.TcpClient
try {
  $conexion = $cliente.BeginConnect($Ip, $Puerto, $null, $null)
  if (-not $conexion.AsyncWaitHandle.WaitOne(6000, $false)) { throw "No contesto en 6 segundos. Esta prendida, con el cable de red, y esta PC en la misma red? Proba: ping $Ip" }
  $cliente.EndConnect($conexion)
  $flujo = $cliente.GetStream()
  $datos = $bytes.ToArray()
  $flujo.Write($datos, 0, $datos.Length)
  $flujo.Flush()
  Start-Sleep -Milliseconds 800
  Write-Host "Listo. Si no salio el papel, fijate que tenga papel y que la IP sea la correcta."
} catch {
  Write-Host ""
  Write-Host ("No se pudo imprimir: " + $_.Exception.Message) -ForegroundColor Red
  exit 1
} finally { $cliente.Close() }
