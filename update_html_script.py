import os
import re

html_path = r"c:\Users\hp\Documents\cineworld dossier programmes formation\CANVA FORMATION FORMULAIRE\index.html"

def update_html():
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()

    # 1. Body
    html = re.sub(
        r'<body[^>]*class="[^"]*"[^>]*>', 
        '<body class="bg-[#09083b] font-body text-slate-200 selection:bg-primary selection:text-white overflow-x-hidden">', 
        html
    )

    # 2. Header specifics
    html = html.replace("bg-white/80", "bg-[#09083b]/80")
    html = html.replace("shadow-slate-200/50", "shadow-black/20")
    html = html.replace("shadow-slate-900/5", "shadow-black/20") # Match the sidebar shadow

    # Texts
    html = re.sub(r'\btext-slate-900\b', 'text-white', html)
    html = re.sub(r'\btext-slate-800\b', 'text-slate-200', html)
    html = re.sub(r'\btext-slate-700\b', 'text-slate-200', html)
    html = re.sub(r'\btext-slate-600\b', 'text-slate-400', html)
    html = re.sub(r'\btext-slate-500\b', 'text-slate-400', html)
    
    html = re.sub(r'\btext-on-surface\b', 'text-slate-100', html) # Just in case

    # Cards / Backgrounds with opacity
    # Let's replace bg-white/xx explicitly first so they don't get caught by bg-white
    html = html.replace("bg-white/90", "bg-[#09083b]/90")
    html = html.replace("bg-white/70", "bg-white/5")
    html = html.replace("bg-white/60", "bg-white/5")
    html = html.replace("bg-slate-50/80", "bg-slate-900/40")
    
    # Now replace standalone bg-white
    # Using negative lookahead to prevent matching bg-white/something
    html = re.sub(r'\bbg-white\b(?!/)', 'bg-white/5', html)
    html = re.sub(r'\bbg-slate-50\b(?!/)', 'bg-white/5', html)
    html = re.sub(r'\bbg-slate-100\b(?!/)', 'bg-white/10', html)
    html = re.sub(r'\bbg-slate-200\b(?!/)', 'bg-white/10', html)

    # Borders
    html = re.sub(r'\border-slate-200\b', 'border-white/10', html)
    html = re.sub(r'\border-slate-100/50\b', 'border-white/10', html)
    html = re.sub(r'\border-slate-100\b', 'border-white/10', html)
    html = re.sub(r'\border-slate-300\b', 'border-white/20', html)
    
    # 5. Accordions
    html = html.replace("bg-blue-50/70", "bg-blue-900/20")
    html = html.replace("bg-purple-50/70", "bg-purple-900/20")
    html = html.replace("bg-amber-50/70", "bg-amber-900/20")
    html = html.replace("bg-pink-50/70", "bg-pink-900/20")
    html = html.replace("bg-emerald-50/70", "bg-emerald-900/20")
    html = html.replace("border-blue-100", "border-blue-500/20")
    html = html.replace("border-purple-100", "border-purple-500/20")
    html = html.replace("border-amber-100", "border-amber-500/20")
    html = html.replace("border-pink-100", "border-pink-500/20")
    html = html.replace("border-emerald-100", "border-emerald-500/20")

    # Accordion texts
    html = html.replace("text-blue-900", "text-blue-200")
    html = html.replace("text-blue-800", "text-blue-300")
    html = html.replace("text-purple-900", "text-purple-200")
    html = html.replace("text-purple-800", "text-purple-300")
    html = html.replace("text-pink-900", "text-pink-200")
    html = html.replace("text-pink-800", "text-pink-300")
    html = html.replace("text-amber-900", "text-amber-200")
    html = html.replace("text-amber-800", "text-amber-300")
    html = html.replace("text-emerald-900", "text-emerald-200")
    html = html.replace("text-emerald-800", "text-emerald-300")
    html = html.replace("text-green-900", "text-green-200")
    
    # 6. Navigation buttons
    html = html.replace("hover:bg-slate-200", "hover:bg-white/10")

    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)
        
update_html()
print('Done!')
