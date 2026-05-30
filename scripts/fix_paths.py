import os
import re

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PAGES_DIR = os.path.join(ROOT_DIR, 'pages')

# Regex patterns to find and prepend '../' to root resources referenced in pages/*.html
replacements = [
    # Reference to index.html -> ../index.html
    (r'(href=["\'])(index\.html)(["\'])', r'\1../index.html\3'),
    # Reference to 404.html -> ../404.html
    (r'(href=["\'])(404\.html)(["\'])', r'\1../404.html\3'),
    # Reference to js/ at root -> ../js/
    (r'(src=["\'])(js/)([^"\']*)(["\'])', r'\1../js/\3\4'),
    # Reference to css/ at root -> ../css/
    (r'(href=["\'])(css/)([^"\']*)(["\'])', r'\1../css/\3\4'),
    # Reference to dist/ at root -> ../dist/
    (r'(href=["\']|src=["\'])(dist/)([^"\']*)(["\'])', r'\1../dist/\3\4'),
    # Reference to assets/ at root -> ../assets/
    (r'(src=["\'])(assets/)([^"\']*)(["\'])', r'\1../assets/\3\4'),
    # Reference to components/ at root -> ../components/
    (r'(href=["\']|src=["\'])(components/)([^"\']*)(["\'])', r'\1../components/\3\4'),
    # Reference to Public/ at root -> ../Public/
    (r'(href=["\']|src=["\'])(Public/)([^"\']*)(["\'])', r'\1../Public/\3\4'),
    # Reference to style.css at root -> ../css/style.css (wait, style.css was moved to css/style.css, so it should be ../css/style.css)
    (r'(href=["\'])(style\.css)(["\'])', r'\1../css/style.css\3'),
]

for filename in os.listdir(PAGES_DIR):
    if not filename.endswith('.html'):
        continue
    
    file_path = os.path.join(PAGES_DIR, filename)
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
        
    original = content
    for pattern, repl in replacements:
        content = re.sub(pattern, repl, content)
        
    if content != original:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed paths in pages/{filename}")

print("Path fixing completed!")
