# La voix TÉMOIN : synthèse vocale de Windows (voix « Microsoft Julie », fr-FR).
# Lancée par voix-temoin.js, qui lui passe un fichier JSON :
#   [{ "texte": "…", "sortie": "C:\…\a01.wav" }, …]
# Elle sert à caler le montage et à faire valider le rythme. Ce n'est PAS la voix
# de diffusion : 16 kHz, timbre de synthèse. Voir LISEZMOI.md pour la remplacer.
param([Parameter(Mandatory = $true)][string]$Liste, [string]$Voix = 'Julie', [string]$Debit = '-4%')

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Attendre($op, [Type]$type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }

$s = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$v = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.DisplayName -like "*$Voix*" -and $_.Language -eq 'fr-FR' } | Select-Object -First 1
if (-not $v) { throw "Voix française introuvable : $Voix" }
$s.Voice = $v

$phrases = Get-Content -Raw -Encoding UTF8 $Liste | ConvertFrom-Json
foreach ($p in $phrases) {
  $texte = [System.Security.SecurityElement]::Escape($p.texte)
  $ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='fr-FR'><prosody rate='$Debit'>$texte</prosody></speak>"
  $flux = Attendre ($s.SynthesizeSsmlToStreamAsync($ssml)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  $lecteur = New-Object Windows.Storage.Streams.DataReader($flux.GetInputStreamAt(0))
  $n = Attendre ($lecteur.LoadAsync([uint32]$flux.Size)) ([uint32])
  $octets = New-Object byte[] $n
  $lecteur.ReadBytes($octets)
  [System.IO.File]::WriteAllBytes($p.sortie, $octets)
}
"$($phrases.Count) phrases ($($v.DisplayName))"
