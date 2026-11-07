"""Package a genuine device build; never substitute a simulator binary."""
import plistlib
from pathlib import Path
import subprocess
import sys
import zipfile

scheme,version=sys.argv[1:]
app=Path('build')/scheme/'Build/Products/Release-iphoneos'/(scheme+'.app')
with (app/'Info.plist').open('rb') as source: info=plistlib.load(source)
if info.get('CFBundleSupportedPlatforms') != ['iPhoneOS'] or info.get('CFBundleShortVersionString') != version:
    raise SystemExit('Wrong platform or version')
binary=app/info['CFBundleExecutable']
if 'arm64' not in subprocess.check_output(['lipo','-archs',str(binary)],text=True): raise SystemExit('Missing arm64 device executable')
if (app/'embedded.mobileprovision').exists(): raise SystemExit('Unexpected signing profile')
if subprocess.run(['codesign','--verify',str(app)],capture_output=True).returncode == 0: raise SystemExit('Expected unsigned application')
suffix='widget-unsigned' if scheme.endswith('WithWidget') else 'unsigned'
output=Path('build/packages')/f'GeometryPanel-{version}-{suffix}.ipa'
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(app.rglob('*')):
        if path.is_file(): archive.write(path, str(Path('Payload')/'GeometryPanel.app'/path.relative_to(app)))
print('Packaged',output.name)
