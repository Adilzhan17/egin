import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const cli = join(dirname(require.resolve('@capacitor/cli/package.json')), 'bin/capacitor');
const platforms = process.argv[2] ? [process.argv[2]] : ['android', 'ios'];
const cap = (...args) => execFileSync(process.execPath, [cli, ...args], { cwd: root, stdio: 'inherit' });
const write = (file, text) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); };
const leaves = '<path android:pathData="M255,355V221" android:strokeColor="#ffffff" android:strokeWidth="20" android:strokeLineCap="round"/><path android:pathData="M246,280c-84,0 -104,-60 -87,-114 71,0 111,45 87,114Z" android:fillColor="#ffffff"/><path android:pathData="M265,234c-19,-71 18,-114 88,-112 21,63 -9,115 -88,112Z" android:fillColor="#ffffff"/>';
const vector = background => `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="512" android:viewportHeight="512">${background ? '<path android:pathData="M0,0H512V512H0Z" android:fillColor="#214d36"/>' : ''}${leaves}</vector>`;
for (const platform of platforms) {
  if (!['android', 'ios'].includes(platform)) throw new Error('Use android or ios');
  if (!existsSync(join(root, platform))) cap('add', platform);
  if (platform === 'android') {
    const res = join(root, 'android/app/src/main/res');
    write(join(res, 'drawable/egin_foreground.xml'), vector(false));
    for (const icon of ['ic_launcher', 'ic_launcher_round']) {
      write(join(res, `mipmap-anydpi-v21/${icon}.xml`), vector(true));
      write(join(res, `mipmap-anydpi-v26/${icon}.xml`), '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/egin_launcher_background"/><foreground android:drawable="@drawable/egin_foreground"/><monochrome android:drawable="@drawable/egin_foreground"/></adaptive-icon>');
    }
    write(join(res, 'values/egin-colors.xml'), '<resources><color name="egin_launcher_background">#214d36</color></resources>');
    const manifest = join(root, 'android/app/src/main/AndroidManifest.xml');
    let xml = readFileSync(manifest, 'utf8');
    if (!xml.includes('android:screenOrientation=')) xml = xml.replace('android:name=".MainActivity"', 'android:name=".MainActivity"\n            android:screenOrientation="portrait"');
    for (const permission of ['CAMERA', 'RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION']) {
      if (!xml.includes(`android.permission.${permission}`)) xml = xml.replace('</manifest>', `    <uses-permission android:name="android.permission.${permission}"/>\n</manifest>`);
    }
    writeFileSync(manifest, xml);
    const styles = join(res, 'values/styles.xml');
    let theme = readFileSync(styles, 'utf8').replace('<item name="android:background">@drawable/splash</item>', '<item name="windowSplashScreenBackground">#ffffff</item>\n        <item name="windowSplashScreenAnimatedIcon">@drawable/egin_foreground</item>\n        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>');
    theme = theme.replace(/(<item name="windowSplashScreenBackground">)[^<]+/, '$1#214d36');
    writeFileSync(styles, theme);
  } else {
    const icon = join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
    copyFileSync(join(root, 'assets/native-icon.png'), icon);
    const plist = join(root, 'ios/App/App/Info.plist');
    let text = readFileSync(plist, 'utf8').replace(/\s*<string>UIInterfaceOrientationLandscape(?:Left|Right)<\/string>/g, '');
    if (!text.includes('UIUserInterfaceStyle')) text = text.replace('<key>LSRequiresIPhoneOS</key>', '<key>UIUserInterfaceStyle</key><string>Light</string>\n\t<key>LSRequiresIPhoneOS</key>');
    for (const [key, description] of Object.entries({ NSCameraUsageDescription: 'Камера нужна для фото растений и сканирования QR датчиков.', NSMicrophoneUsageDescription: 'Микрофон нужен для голосовых заметок в дневнике.', NSLocationWhenInUseUsageDescription: 'Местоположение нужно для отметки вашего участка на карте.' })) {
      if (!text.includes(key)) text = text.replace('</dict>', `<key>${key}</key><string>${description}</string>\n</dict>`);
    }
    writeFileSync(plist, text);
    write(join(root, 'ios/App/App/PrivacyInfo.xcprivacy'), '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>NSPrivacyAccessedAPITypes</key><array><dict><key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryFileTimestamp</string><key>NSPrivacyAccessedAPITypeReasons</key><array><string>C617.1</string></array></dict></array></dict></plist>');
    const project = join(root, 'ios/App/App.xcodeproj/project.pbxproj');
    let projectText = readFileSync(project, 'utf8').replace(/TARGETED_DEVICE_FAMILY = "1,2";/g, 'TARGETED_DEVICE_FAMILY = 1;');
    if (!projectText.includes('PrivacyInfo.xcprivacy')) {
      projectText = projectText.replace('/* Begin PBXBuildFile section */', '/* Begin PBXBuildFile section */\n\t\tE61000000000000000000001 /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = E61000000000000000000002 /* PrivacyInfo.xcprivacy */; };');
      projectText = projectText.replace('/* Begin PBXFileReference section */', '/* Begin PBXFileReference section */\n\t\tE61000000000000000000002 /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };');
      projectText = projectText.replace(/(\/\* App \*\/ = \{\s*isa = PBXGroup;\s*children = \()/, '$1\n\t\t\t\tE61000000000000000000002 /* PrivacyInfo.xcprivacy */,');
      projectText = projectText.replace(/(isa = PBXResourcesBuildPhase;[\s\S]*?files = \()/, '$1\n\t\t\t\tE61000000000000000000001 /* PrivacyInfo.xcprivacy in Resources */,');
    }
    writeFileSync(project, projectText);
  }
  cap('sync', platform);
}
