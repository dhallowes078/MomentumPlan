const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function readAppVersion() {
  const versionFile = path.join(__dirname, "..", "..", "web", "src", "lib", "version.ts");
  const src = fs.readFileSync(versionFile, "utf8");
  const match = src.match(/version:\s*"([^"]+)"/);
  return match?.[1] ?? "0.0.0";
}

function versionCodeFromSemver(version) {
  const [maj, min, pat] = version.split(".").map((n) => parseInt(n, 10) || 0);
  return maj * 10000 + min * 100 + pat;
}

const appVersion = readAppVersion();
const versionCode = versionCodeFromSemver(appVersion);

const candidates = [
  process.env.JAVA_HOME,
  "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.11.10-hotspot",
  "C:\\Program Files\\Android\\Android Studio\\jbr",
].filter(Boolean);

const javaHome = candidates.find((dir) => fs.existsSync(path.join(dir, "bin", "java.exe")));
if (!javaHome) {
  console.error("No JDK found. Set JAVA_HOME or install Temurin 21 / Android Studio.");
  process.exit(1);
}

const androidDir = path.join(__dirname, "..", "android");
const sdkDir = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk");
const localProps = path.join(androidDir, "local.properties");
if (!fs.existsSync(localProps) && fs.existsSync(sdkDir)) {
  fs.writeFileSync(localProps, `sdk.dir=${sdkDir.replace(/\\/g, "/")}\n`);
}

const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: process.env.ANDROID_HOME || sdkDir,
  ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT || sdkDir,
  Path: `${path.join(javaHome, "bin")};${process.env.Path || process.env.PATH || ""}`,
};

const result = spawnSync(
  path.join(androidDir, "gradlew.bat"),
  ["assembleDebug", `-PappVersionName=${appVersion}`, `-PappVersionCode=${versionCode}`],
  {
    cwd: androidDir,
    env,
    stdio: "inherit",
    shell: true,
  }
);

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}

const builtApk = path.join(androidDir, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
const repoRoot = path.join(__dirname, "..", "..", "..");
const versionedApk = path.join(repoRoot, `Momentum-${appVersion}-debug.apk`);
const destApk = path.join(repoRoot, "Momentum-debug.apk");
fs.copyFileSync(builtApk, versionedApk);
fs.copyFileSync(builtApk, destApk);
console.log(`Copied APK to ${versionedApk}`);
console.log(`Also copied to ${destApk}`);
process.exit(0);
