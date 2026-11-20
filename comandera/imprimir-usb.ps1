# Manda bytes crudos (ESC/POS) a una impresora instalada en Windows, por su nombre, sin compartirla ni cambiarle nada.
# Es lo mismo que hace cualquier programa de comandas: abre la impresora, abre un documento RAW y escribe.
# Lo usa comandera.js (opcion --usb). A mano:  powershell -File imprimir-usb.ps1 -Impresora "NOMBRE" -Archivo ticket.bin
param([string]$Impresora, [string]$Archivo)
$ErrorActionPreference = "Stop"
$src = @"
using System;
using System.Runtime.InteropServices;
public class NktRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool OpenPrinter(string name, out IntPtr h, IntPtr pd);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool StartDocPrinter(IntPtr h, int level, [In] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool WritePrinter(IntPtr h, byte[] b, int count, out int written);
  public static void Enviar(string impresora, byte[] bytes) {
    IntPtr h;
    if (!OpenPrinter(impresora, out h, IntPtr.Zero)) throw new Exception("No se encontro la impresora '" + impresora + "' en Windows (error " + Marshal.GetLastWin32Error() + "). El nombre tiene que ser el de Impresoras y escaneres.");
    try {
      DOCINFO di = new DOCINFO(); di.pDocName = "Comanda NKT"; di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, di)) throw new Exception("La impresora no acepto el documento (error " + Marshal.GetLastWin32Error() + ").");
      try {
        StartPagePrinter(h);
        int w; if (!WritePrinter(h, bytes, bytes.Length, out w) || w != bytes.Length) throw new Exception("No se pudo escribir en la impresora (error " + Marshal.GetLastWin32Error() + ").");
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
"@
Add-Type -TypeDefinition $src
[NktRawPrinter]::Enviar($Impresora, [System.IO.File]::ReadAllBytes($Archivo))
# Avisa que el ticket ya se mando (el programa no espera a que PowerShell se cierre, que en Windows 7 a veces tarda).
Write-Output "OK-NKT"
