$html_path = "c:\Users\hp\Documents\cineworld dossier programmes formation\CANVA FORMATION FORMULAIRE\index.html"
$content = Get-Content -Path $html_path -Raw -Encoding UTF8

# 1. Body
$content = $content -replace '<body[^>]*class="[^"]*"[^>]*>', '<body class="bg-[#09083b] font-body text-slate-200 selection:bg-primary selection:text-white overflow-x-hidden">'

# 2. Header
$content = $content.Replace("bg-white/80", "bg-[#09083b]/80")
$content = $content.Replace("shadow-slate-200/50", "shadow-black/20")
$content = $content.Replace("shadow-slate-900/5", "shadow-black/20")

# Texts
$content = $content -replace '\btext-slate-900\b', 'text-white'
$content = $content -replace '\btext-slate-800\b', 'text-slate-200'
$content = $content -replace '\btext-slate-700\b', 'text-slate-200'
$content = $content -replace '\btext-slate-600\b', 'text-slate-400'
$content = $content -replace '\btext-slate-500\b', 'text-slate-400'
$content = $content -replace '\btext-on-surface\b', 'text-slate-100'

# Exception handling before globals
$content = $content.Replace("bg-white/90", "bg-[#09083b]/90")
$content = $content.Replace("bg-white/70", "bg-white/5")
$content = $content.Replace("bg-white/60", "bg-white/5")
$content = $content.Replace("bg-slate-50/80", "bg-slate-900/40")

# Cards / Backgrounds
$content = $content -replace '\bbg-white\b(?!/)', 'bg-white/5'
$content = $content -replace '\bbg-slate-50\b(?!/)', 'bg-white/5'
$content = $content -replace '\bbg-slate-100\b(?!/)', 'bg-white/10'
$content = $content -replace '\bbg-slate-200\b(?!/)', 'bg-white/10'

# Borders
$content = $content -replace '\bborder-slate-200\b', 'border-white/10'
$content = $content -replace '\bborder-slate-100/50\b', 'border-white/10'
$content = $content -replace '\bborder-slate-100\b', 'border-white/10'
$content = $content -replace '\bborder-slate-300\b', 'border-white/20'

# 5. Accordions
$content = $content.Replace("bg-blue-50/70", "bg-blue-900/20")
$content = $content.Replace("bg-purple-50/70", "bg-purple-900/20")
$content = $content.Replace("bg-amber-50/70", "bg-amber-900/20")
$content = $content.Replace("bg-pink-50/70", "bg-pink-900/20")
$content = $content.Replace("bg-emerald-50/70", "bg-emerald-900/20")
$content = $content.Replace("border-blue-100", "border-blue-500/20")
$content = $content.Replace("border-purple-100", "border-purple-500/20")
$content = $content.Replace("border-amber-100", "border-amber-500/20")
$content = $content.Replace("border-pink-100", "border-pink-500/20")
$content = $content.Replace("border-emerald-100", "border-emerald-500/20")

# Accordion texts
$content = $content.Replace("text-blue-900", "text-blue-200")
$content = $content.Replace("text-blue-800", "text-blue-300")
$content = $content.Replace("text-purple-900", "text-purple-200")
$content = $content.Replace("text-purple-800", "text-purple-300")
$content = $content.Replace("text-pink-900", "text-pink-200")
$content = $content.Replace("text-pink-800", "text-pink-300")
$content = $content.Replace("text-amber-900", "text-amber-200")
$content = $content.Replace("text-amber-800", "text-amber-300")
$content = $content.Replace("text-emerald-900", "text-emerald-200")
$content = $content.Replace("text-emerald-800", "text-emerald-300")
$content = $content.Replace("text-green-900", "text-green-200")

# 6. Navigation buttons
$content = $content.Replace("hover:bg-slate-200", "hover:bg-white/10")
$content = $content.Replace("bg-slate-100 text-slate-700", "bg-white/10 text-white")

Set-Content -Path $html_path -Value $content -Encoding UTF8
Write-Host "Done via PowerShell PowerShell!"
