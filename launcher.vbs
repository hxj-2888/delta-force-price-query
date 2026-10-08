' ============================================================
'  LuMuCha (DeltaForcePriceQuery) - desktop launcher
'  Starts the local server with no console window and opens the
'  browser only after the server actually answers.
'
'  Why not start.bat: it opens a console window, and it launches
'  the browser BEFORE "node server.js", so a slow start lands the
'  user on the browser's error page. This launcher polls the port
'  first and shows a dialog if startup fails.
'
'  Implementation notes (learned the hard way on a zh-CN machine):
'   - Launch node.exe DIRECTLY. Do not wrap it in "cmd /c ... >> log":
'     cmd's /c quoting rules break with a trailing redirect and the
'     log ends up empty. Logging is done by server.js via LOG_FILE.
'   - Find node by scanning PATH with FileExists instead of sh.Exec
'     ("where node"): sh.Exec returns console-codepage text, which
'     corrupts non-ASCII paths (e.g. F:\xe7\xa8\x8b... \node.exe).
'     WshShell.Environment and FileExists are Unicode-clean.
'   - Keep this file ASCII-only: WSH reads .vbs as ANSI, so non-ASCII
'     comments get mangled. Chinese user docs live in README.md.
' ============================================================

Option Explicit

Const PORT = 3000
Const READY_TIMEOUT_S = 20

Dim fso, sh, appDir, nodeExe, serverJs, logFile, baseUrl

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

appDir   = fso.GetParentFolderName(WScript.ScriptFullName)
serverJs = appDir & "\server.js"
logFile  = appDir & "\server.log"
baseUrl  = "http://localhost:" & PORT

' ---- Already running? Reuse it. A second server.js cannot bind the
'     port and would die silently, leaving a stale page with no data.
If IsServerUp(PORT) Then
  sh.Run baseUrl, 1, False
  WScript.Quit 0
End If

If Not fso.FileExists(serverJs) Then
  MsgBox "server.js was not found next to the launcher:" & vbCrLf & vbCrLf & appDir, _
         vbCritical, "LuMuCha"
  WScript.Quit 1
End If

nodeExe = FindNode()
If nodeExe = "" Then
  MsgBox "Node.js was not found on this machine." & vbCrLf & vbCrLf & _
         "Install the LTS build from https://nodejs.org" & vbCrLf & _
         "then open LuMuCha again.", vbCritical, "LuMuCha - Node.js missing"
  WScript.Quit 1
End If

' ---- Launch hidden (window style 0) and hand the log path to server.js
sh.CurrentDirectory = appDir
sh.Environment("PROCESS")("LOG_FILE") = logFile
sh.Run """" & nodeExe & """ """ & serverJs & """", 0, False

If Not WaitForServer(PORT, READY_TIMEOUT_S) Then
  MsgBox "The local server did not answer within " & READY_TIMEOUT_S & " seconds." & vbCrLf & vbCrLf & _
         "Details are in:" & vbCrLf & logFile & vbCrLf & vbCrLf & _
         "Tip: run start.bat to watch the server output live.", _
         vbCritical, "LuMuCha"
  WScript.Quit 1
End If

sh.Run baseUrl, 1, False
WScript.Quit 0

' ============================================================
' Helpers
' ============================================================

' True when something already answers on the port.
' WinHttpRequest (not XMLHTTP) because it supports synchronous timeouts;
' an XMLHTTP timeout needs the async callback API, which cannot block here.
Function IsServerUp(port)
  Dim http
  IsServerUp = False
  On Error Resume Next
  Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
  If Err.Number <> 0 Then
    Err.Clear
    On Error GoTo 0
    Exit Function
  End If
  http.SetTimeouts 1000, 1000, 2000, 2000   ' resolve / connect / send / recv
  http.Open "GET", "http://127.0.0.1:" & port & "/", False
  http.Send
  If Err.Number = 0 Then IsServerUp = True
  Err.Clear
  On Error GoTo 0
End Function

' Poll the port until it answers, or give up after timeoutS seconds.
Function WaitForServer(port, timeoutS)
  Dim waited
  waited = 0
  Do While waited < timeoutS * 1000
    If IsServerUp(port) Then
      WaitForServer = True
      Exit Function
    End If
    WScript.Sleep 400
    waited = waited + 400
  Loop
  WaitForServer = False
End Function

' Full path to node.exe, or "" when Node.js is not installed.
Function FindNode()
  Dim candidates, i, shPaths, rawPath, parts, p

  ' Standard install locations first: explicit beats whatever is on PATH.
  candidates = Array( _
    sh.ExpandEnvironmentStrings("%ProgramFiles%\nodejs\node.exe"), _
    sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%\nodejs\node.exe"), _
    sh.ExpandEnvironmentStrings("%LOCALAPPDATA%\Programs\nodejs\node.exe"))

  For i = 0 To UBound(candidates)
    If fso.FileExists(candidates(i)) Then
      FindNode = candidates(i)
      Exit Function
    End If
  Next

  ' PATH scan (nvm-style and manual installs, incl. non-ASCII dirs).
  ' Read from WshShell.Environment rather than sh.Exec: it is Unicode-safe.
  rawPath = sh.Environment("PROCESS")("PATH")
  If Len(rawPath) > 0 Then
    parts = Split(rawPath, ";")
    For i = 0 To UBound(parts)
      p = Trim(parts(i))
      If p <> "" Then
        If Right(p, 1) = "\" Then p = Left(p, Len(p) - 1)
        If fso.FileExists(p & "\node.exe") Then
          FindNode = p & "\node.exe"
          Exit Function
        End If
      End If
    Next
  End If
End Function