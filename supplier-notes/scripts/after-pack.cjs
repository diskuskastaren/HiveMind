const fs = require('node:fs');
const path = require('node:path');
const PE = require('pe-library');
const ResEdit = require('resedit');

// electron-builder's Windows resource editor unpacks a signing bundle containing
// symbolic links. Edit the unsigned executable directly so packaging also works
// on Windows accounts without Developer Mode.
module.exports = async (context) => {
  if (context.electronPlatformName !== 'win32') return;

  const name = context.packager.appInfo.productFilename;
  const executablePath = path.join(context.appOutDir, `${name}.exe`);
  const iconPath = path.join(context.packager.projectDir, 'electron', 'icon.ico');
  const exe = PE.NtExecutable.from(fs.readFileSync(executablePath));
  const resources = PE.NtExecutableResource.from(exe);
  const icons = ResEdit.Data.IconFile.from(fs.readFileSync(iconPath));
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    resources.entries, 1, 1033, icons.icons.map((icon) => icon.data),
  );

  const version = context.packager.appInfo.version.split('.').map(Number);
  for (const info of ResEdit.Resource.VersionInfo.fromEntries(resources.entries)) {
    info.setFileVersion(...version, 0, 1033);
    info.setProductVersion(...version, 0, 1033);
    info.setStringValues({ lang: 1033, codepage: 1200 }, {
      FileDescription: name,
      ProductName: name,
      FileVersion: context.packager.appInfo.version,
      ProductVersion: context.packager.appInfo.version,
    });
    info.outputToResourceEntries(resources.entries);
  }

  resources.outputResource(exe);
  fs.writeFileSync(executablePath, Buffer.from(exe.generate()));
};
