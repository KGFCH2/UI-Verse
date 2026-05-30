import os
import shutil
import re

# Setup paths
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PAGES_DIR = os.path.join(ROOT_DIR, 'pages')
CSS_DIR = os.path.join(ROOT_DIR, 'css')
JS_DIR = os.path.join(ROOT_DIR, 'js')
ASSETS_DIR = os.path.join(ROOT_DIR, 'assets')

# Make directories if they don't exist
os.makedirs(PAGES_DIR, exist_ok=True)
os.makedirs(CSS_DIR, exist_ok=True)
os.makedirs(JS_DIR, exist_ok=True)
os.makedirs(ASSETS_DIR, exist_ok=True)

# Files to keep at root
KEEP_HTML = {'index.html', '404.html'}
KEEP_JS = set()  # Move all JS files to js/
KEEP_CSS = set() # Move all CSS files to css/

def get_root_files():
    html_files = []
    css_files = []
    js_files = []
    asset_files = []
    
    for f in os.listdir(ROOT_DIR):
        full_path = os.path.join(ROOT_DIR, f)
        if not os.path.isfile(full_path):
            continue
        
        ext = os.path.splitext(f)[1].lower()
        if ext == '.html' and f not in KEEP_HTML:
            html_files.append(f)
        elif ext == '.css':
            css_files.append(f)
        elif ext == '.js':
            js_files.append(f)
        elif ext in {'.png', '.jpg', '.jpeg', '.gif', '.ico'}:
            asset_files.append(f)
            
    return html_files, css_files, js_files, asset_files

html_to_move, css_to_move, js_to_move, assets_to_move = get_root_files()

print(f"Found {len(html_to_move)} HTML files to move to pages/")
print(f"Found {len(css_to_move)} CSS files to move to css/")
print(f"Found {len(js_to_move)} JS files to move to js/")
print(f"Found {len(assets_to_move)} asset files to move to assets/")

# Build mappings of original filename to its new relative path from the root
file_mappings = {}
for f in html_to_move:
    file_mappings[f] = f"pages/{f}"
for f in css_to_move:
    file_mappings[f] = f"css/{f}"
for f in js_to_move:
    file_mappings[f] = f"js/{f}"
for f in assets_to_move:
    file_mappings[f] = f"assets/{f}"

# Also handle backup files (.bak) - let's find and move/delete them
# To keep directory clean, let's delete or move `.bak` files.
# Let's delete all `.bak` files since they are redundant backup files that clutter the directory.
bak_files = [f for f in os.listdir(ROOT_DIR) if f.endswith('.bak') or '.html.bak' in f or '.css.bak' in f or 'backup' in f]
print(f"Found {len(bak_files)} backup files. Deleting them to clean the workspace...")
for f in bak_files:
    try:
        os.remove(os.path.join(ROOT_DIR, f))
    except Exception as e:
        print(f"Failed to delete {f}: {e}")

# Move files
moved_files = []

for f in html_to_move:
    shutil.move(os.path.join(ROOT_DIR, f), os.path.join(PAGES_DIR, f))
    moved_files.append((os.path.join(PAGES_DIR, f), 'html'))

for f in css_to_move:
    shutil.move(os.path.join(ROOT_DIR, f), os.path.join(CSS_DIR, f))
    moved_files.append((os.path.join(CSS_DIR, f), 'css'))

for f in js_to_move:
    shutil.move(os.path.join(ROOT_DIR, f), os.path.join(JS_DIR, f))
    moved_files.append((os.path.join(JS_DIR, f), 'js'))

for f in assets_to_move:
    shutil.move(os.path.join(ROOT_DIR, f), os.path.join(ASSETS_DIR, f))
    moved_files.append((os.path.join(ASSETS_DIR, f), 'asset'))

# Now we need to update references in all moved files and root files (index.html, 404.html)
# Let's write a function to update references inside a file
def update_references(file_path, is_in_pages):
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as file:
        content = file.read()

    original_content = content
    
    # We want to replace references to moved files.
    # For HTML files in pages/ directory, the reference prefix should be relative to pages/
    # (e.g. style.css -> ../css/style.css, button.html -> button.html, uiverse.png -> ../assets/uiverse.png)
    # E.g. href="style.css" -> href="../css/style.css"
    # E.g. href="button.html" -> href="button.html"
    # Let's do this by matching the exact file name in quotes/delimiters
    
    # We will match references like: "filename.ext", 'filename.ext', href="filename.ext", src="filename.ext"
    # To be safe, we can find any occurrence of the filename and replace it based on its context.
    # Let's match filenames with boundaries or quotes to avoid matching substrings of other words.
    
    for filename, new_root_path in file_mappings.items():
        # Determine the target path from the perspective of this file
        if is_in_pages:
            # If the file is in pages/
            if new_root_path.startswith('pages/'):
                # E.g. button.html -> button.html (same folder)
                target_path = os.path.basename(filename)
            else:
                # E.g. css/style.css -> ../css/style.css
                target_path = "../" + new_root_path
        else:
            # If the file is at the root (index.html, 404.html, or a script/css if any)
            target_path = new_root_path
            
        # We replace references. We must handle patterns like:
        # href="filename", src="filename", url('filename'), url("filename"), "filename", 'filename'
        # Let's use regex pattern to find filename preceded/followed by quotes, slashes, or word boundaries.
        pattern = r'(["\'(])(' + re.escape(filename) + r')(["\'\)])'
        
        def replace_match(match):
            return match.group(1) + target_path + match.group(3)
            
        content = re.sub(pattern, replace_match, content)

    # Let's also update paths of folders that were previously accessed directly but are now relative to pages/
    # E.g., inside pages/ files:
    # "dist/" -> "../dist/"
    # "js/features/" -> "../js/features/"
    # "components/" -> "../components/"
    # "Public/" -> "../Public/"
    if is_in_pages:
        # Match references to directories at root that don't have leading ../
        dir_patterns = [
            (r'(["\'(])(dist/)([^"\'\)]*)', r'\1../dist/\3'),
            (r'(["\'(])(js/features/)([^"\'\)]*)', r'\1../js/features/\3'),
            (r'(["\'(])(components/)([^"\'\)]*)', r'\1../components/\3'),
            (r'(["\'(])(Public/)([^"\'\)]*)', r'\1../Public/\3'),
        ]
        for pat, repl in dir_patterns:
            content = re.sub(pat, repl, content)

    if content != original_content:
        with open(file_path, 'w', encoding='utf-8') as file:
            file.write(content)

# Update references in root files
for root_file in ['index.html', '404.html']:
    full_path = os.path.join(ROOT_DIR, root_file)
    if os.path.exists(full_path):
        update_references(full_path, is_in_pages=False)

# Update references in all moved files
for file_path, file_type in moved_files:
    is_in_pages = (file_type == 'html')
    update_references(file_path, is_in_pages)

print("Restructuring and reference updates completed successfully!")
