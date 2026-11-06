@echo off
setlocal
set "ROBO_SETUP_SELF=%~f0"
set "ROBO_SETUP_TARGET=%~1"
set "ROBO_SETUP_CHECK=%~2"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText($env:ROBO_SETUP_SELF); $marker='# POWERSHELL_'+'PAYLOAD'; & ([ScriptBlock]::Create($s.Substring($s.IndexOf($marker)+$marker.Length)))"
set "ROBO_SETUP_EXIT=%ERRORLEVEL%"
echo.
if not "%ROBO_SETUP_CHECK%"=="--check" pause
exit /b %ROBO_SETUP_EXIT%
# POWERSHELL_PAYLOAD
$ErrorActionPreference = 'Stop'

# One-file installer for Windows 11 / supported Windows 10.
# Usage: setup-roborally.bat [destination-folder]
# Syntax-only check: setup-roborally.bat "" --check
# Run as your normal Windows user; the prerequisite step requests UAC itself.
$linuxRoot = @'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl ca-certificates git direnv python3 xz-utils bzip2
python3 - <<'PY'
import configparser
from pathlib import Path
p = Path('/etc/wsl.conf')
c = configparser.ConfigParser(interpolation=None, strict=False)
c.read(p)
if not c.has_section('boot'):
    c.add_section('boot')
if c.get('boot', 'systemd', fallback='false').lower() != 'true':
    if p.exists():
        import shutil
        shutil.copy2(p, '/etc/wsl.conf.before-roborally')
    c.set('boot', 'systemd', 'true')
    with p.open('w') as f:
        c.write(f)
PY
'@
$linuxNix = @'
set -euo pipefail
if [ "$(ps -p 1 -o comm=)" != systemd ]; then
  echo 'systemd is not running. Restart Ubuntu and rerun the batch file.' >&2
  exit 1
fi
if ! command -v nix >/dev/null && [ ! -x /nix/var/nix/profiles/default/bin/nix ]; then
  installer=$(mktemp)
  trap 'rm -f "$installer"' EXIT
  curl --proto '=https' --tlsv1.2 -fL https://nixos.org/nix/install -o "$installer"
  NIX_INSTALLER_NO_CHANNEL_ADD=1 sh "$installer" --daemon --yes
fi
mkdir -p /etc/nix
if ! grep -Eq '^extra-experimental-features *=.*nix-command.*flakes' /etc/nix/nix.conf; then
  printf '\nextra-experimental-features = nix-command flakes\n' >> /etc/nix/nix.conf
fi
if getent group nix-users >/dev/null; then
  usermod -aG nix-users "$ROBO_USER"
fi
systemd-tmpfiles --create
systemctl enable nix-daemon.service
systemctl restart nix-daemon.service
'@
$linuxUser = @'
set -euo pipefail
if [ -f /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh ]; then
  . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh
fi
mkdir -p "$HOME/.config/nix"
touch "$HOME/.bashrc"
if ! grep -Fq 'direnv hook bash' "$HOME/.bashrc"; then
  printf '\neval "$(direnv hook bash)"\n' >> "$HOME/.bashrc"
fi
# Scope trust to this checkout on the Windows-mounted drive.
if ! git config --global --get-all safe.directory | grep -Fxq "$ROBO_REPO"; then
  git config --global --add safe.directory "$ROBO_REPO"
fi
cd "$ROBO_REPO"
if [ ! -f .envrc ]; then
  cp .envrc-example .envrc
fi
# Existing .envrc files can execute arbitrary commands; approve those manually.
if ! cmp -s .envrc .envrc-example; then
  echo 'Existing custom .envrc preserved. Review it, then run direnv allow manually.'
  nix develop -c bash -c 'set -e; node --version; pnpm --version; pnpm build; pnpm typecheck'
else
  direnv allow
  direnv exec . bash -c 'set -e; node --version; pnpm --version; pnpm build; pnpm typecheck'
fi
'@
$linuxClone = @'
set -euo pipefail
if [ -e "$ROBO_REPO" ] && [ ! -d "$ROBO_REPO" ]; then
  echo 'Destination is a file. Choose another folder.' >&2
  exit 1
fi
if [ -e "$ROBO_REPO/.git" ]; then
  if ! git config --global --get-all safe.directory | grep -Fxq "$ROBO_REPO"; then
    git config --global --add safe.directory "$ROBO_REPO"
  fi
  origin=$(git -C "$ROBO_REPO" remote get-url origin)
  if ! printf '%s\n' "$origin" | grep -Eiq '^(https://github\.com/|git@github\.com:|ssh://git@github\.com/)hananinas/RoboRally(\.git)?/?$'; then
    echo 'Destination contains a different repository.' >&2
    exit 1
  fi
  if [ -n "$(git -C "$ROBO_REPO" status --porcelain)" ]; then
    echo 'Existing checkout has changes. Commit/preserve them or choose another destination.' >&2
    exit 1
  fi
  if git -C "$ROBO_REPO" ls-files --eol | grep -Eq 'w/(crlf|mixed)'; then
    echo 'Existing checkout contains CRLF/mixed endings. Choose a fresh destination.' >&2
    exit 1
  fi
  git -C "$ROBO_REPO" config --local core.autocrlf false
  echo 'Reusing the checkout without changing its branch or pulling updates.'
else
  if [ -d "$ROBO_REPO" ] && [ -n "$(find "$ROBO_REPO" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
    echo 'Destination is not empty. Choose another folder.' >&2
    exit 1
  fi
  mkdir -p "$(dirname "$ROBO_REPO")"
  # Git runs in Linux; GitHub CLI uses the signed-in Windows user's keyring.
  # No token is copied into the guest or stored in the repository.
  export ROBO_GH
  GIT_TERMINAL_PROMPT=0 git -c core.autocrlf=false -c core.eol=lf \
    -c credential.helper= \
    -c 'credential.helper=!f() { "$ROBO_GH" auth git-credential "$@"; }; f' \
    clone https://github.com/hananinas/RoboRally.git "$ROBO_REPO"
  git -C "$ROBO_REPO" config --local core.autocrlf false
fi
'@

function Invoke-Native {
    param([string]$Exe, [string[]]$Arguments)
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Exe failed (exit $LASTEXITCODE)." }
}
function Invoke-Linux {
    param([string]$User, [string]$Script, [hashtable]$Variables = @{})
    # Base64 avoids cmd/PowerShell/WSL quoting and CRLF problems.
    $prefix = ''
    foreach ($key in $Variables.Keys) {
        $value = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$Variables[$key]))
        $prefix += "export $key=" + '$(printf %s ' + $value + ' | base64 -d)' + "`n"
    }
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($prefix + $Script).Replace("`r", '')))
    Invoke-Native 'wsl.exe' @('-d', 'Ubuntu', '-u', $User, '--', 'bash', '-c', "printf %s $encoded | base64 -d | bash")
}
function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + $env:Path
}

try {
    if ($env:ROBO_SETUP_CHECK -eq '--check') {
        foreach ($script in @($linuxRoot, $linuxNix, $linuxUser, $linuxClone)) {
            $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script.Replace("`r", '')))
            Invoke-Native 'wsl.exe' @('-d', 'Ubuntu', '--', 'bash', '-c', "printf %s $encoded | base64 -d | bash -n")
        }
        Write-Host 'PowerShell and all embedded Bash scripts passed syntax checks.'
        exit 0
    }
    if ([Environment]::OSVersion.Version.Build -lt 19041) {
        throw 'Windows 10 build 19041 or newer, or Windows 11, is required.'
    }
    $target = $env:ROBO_SETUP_TARGET
    if (-not $target) { $target = Join-Path $env:USERPROFILE 'GitHub\DTU\RoboRally' }
    $target = [IO.Path]::GetFullPath($target)
    if ($target -notmatch '^[A-Za-z]:\\') { throw 'Use a local drive destination, not a network share.' }
    Write-Host "RoboRally destination: $target"
    Write-Host 'Windows prerequisites may request administrator approval. No automatic restart is performed.'

    # Elevate only prerequisite installation; clone and GitHub login remain under the caller.
    $resultFile = Join-Path $env:TEMP ('roborally-prerequisites-' + [guid]::NewGuid() + '.txt')
    $adminScript = @'
$ErrorActionPreference = 'Stop'
try {
    # Microsoft documents this bootstrap for clean Windows Sandbox installations.
    if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $ProgressPreference = 'SilentlyContinue'
        Install-PackageProvider -Name NuGet -Force | Out-Null
        Install-Module -Name Microsoft.WinGet.Client -Force -Repository PSGallery -Scope CurrentUser | Out-Null
        Import-Module Microsoft.WinGet.Client
        Repair-WinGetPackageManager -AllUsers | Out-Null
        $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + $env:Path
        if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) { throw 'WinGet bootstrap failed. Install/update Microsoft App Installer and rerun setup.' }
    }
    $restart = $false
    foreach ($feature in @('VirtualMachinePlatform', 'Microsoft-Windows-Subsystem-Linux')) {
        if ((Get-WindowsOptionalFeature -Online -FeatureName $feature).State -ne 'Enabled') {
            $result = Enable-WindowsOptionalFeature -Online -FeatureName $feature -All -NoRestart
            $restart = $restart -or $result.RestartNeeded
        }
    }
    $packages = @(
        @{ Id='GitHub.cli'; Command='gh.exe'; Path="$env:ProgramFiles\GitHub CLI\gh.exe" }
    )
    foreach ($package in $packages) {
        if (-not (Get-Command $package.Command -ErrorAction SilentlyContinue) -and -not (Test-Path -LiteralPath $package.Path)) {
            & winget.exe install --id $package.Id --exact --source winget --accept-source-agreements --accept-package-agreements --silent --disable-interactivity
            if ($LASTEXITCODE -eq 3010) { $restart = $true }
            elseif ($LASTEXITCODE -ne 0) { throw "Installing $($package.Id) failed (exit $LASTEXITCODE)." }
        }
    }
    & wsl.exe --version *> $null
    if ($LASTEXITCODE -ne 0) {
        & winget.exe install --id Microsoft.WSL --exact --source winget --accept-source-agreements --accept-package-agreements --silent --disable-interactivity
        if ($LASTEXITCODE -eq 3010) { $restart = $true }
        elseif ($LASTEXITCODE -ne 0) { throw "Installing WSL failed (exit $LASTEXITCODE)." }
    }
    if ($restart) { 'RESTART' | Set-Content -LiteralPath '__RESULT__' }
    else { 'OK' | Set-Content -LiteralPath '__RESULT__' }
} catch {
    ('ERROR: ' + $_.Exception.Message) | Set-Content -LiteralPath '__RESULT__'
}
'@
    $adminScript = $adminScript.Replace('__RESULT__', $resultFile.Replace("'", "''"))
    $adminEncoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($adminScript))
    Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $adminEncoded)
    if (-not (Test-Path -LiteralPath $resultFile)) { throw 'Administrator setup did not return a result.' }
    $result = (Get-Content -LiteralPath $resultFile -Raw).Trim()
    Remove-Item -LiteralPath $resultFile
    if ($result -eq 'RESTART') {
        Write-Host 'Restart Windows, then run this same batch file again to continue.' -ForegroundColor Yellow
        exit 3010
    }
    if ($result -ne 'OK') { throw $result }
    Refresh-Path
    foreach ($dir in @("$env:ProgramFiles\GitHub CLI")) {
        $env:Path += ';' + $dir
    }

    $distros = ((& wsl.exe --list --quiet) -join "`n").Replace([string][char]0, '')
    if ($LASTEXITCODE -ne 0) { throw 'Could not list WSL distributions. Restart Windows and retry.' }
    $newDistro = -not (($distros -split "`n" | ForEach-Object { $_.Trim() }) -contains 'Ubuntu')
    if ($newDistro) {
        Invoke-Native 'wsl.exe' @('--install', '-d', 'Ubuntu', '--no-launch', '--web-download')
    }
    $registration = Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss' | Get-ItemProperty | Where-Object { $_.DistributionName -eq 'Ubuntu' } | Select-Object -First 1
    if (-not $registration) { throw 'Ubuntu was not registered. Restart Windows and rerun setup.' }
    if ($registration.Version -ne 2) { throw 'Existing Ubuntu uses WSL 1. Back it up and convert it with: wsl --set-version Ubuntu 2. Then rerun setup.' }
    Invoke-Linux 'root' $linuxRoot
    $init = ((& wsl.exe -d Ubuntu -u root -- ps -p 1 -o comm=) -join '').Trim()
    if ($init -ne 'systemd') {
        Write-Host 'Ubuntu needs to restart to enable systemd. Close work in Ubuntu first.'
        [void](Read-Host 'Press Enter when Ubuntu can be restarted')
        Invoke-Native 'wsl.exe' @('--terminate', 'Ubuntu')
    }
    $linuxName = ((& wsl.exe -d Ubuntu -- id -un) -join '').Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Could not determine the Ubuntu user.' }
    if ($linuxName -eq 'root') {
        $suggested = ($env:USERNAME.ToLowerInvariant() -replace '[^a-z0-9_-]', '')
        if ($suggested -notmatch '^[a-z][a-z0-9_-]*$') { $suggested = 'developer' }
        $linuxName = Read-Host "Choose a Linux username [$suggested]"
        if (-not $linuxName) { $linuxName = $suggested }
        if ($linuxName -notmatch '^[a-z][a-z0-9_-]{0,30}$' -or $linuxName -eq 'root') { throw 'Invalid Linux username.' }
        Invoke-Linux 'root' 'id "$ROBO_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash -G sudo "$ROBO_USER"' @{ROBO_USER=$linuxName}
        Write-Host 'Set the Linux password now. Password characters are not displayed.'
        Invoke-Native 'wsl.exe' @('-d', 'Ubuntu', '-u', 'root', '--', 'passwd', $linuxName)
        Invoke-Native 'wsl.exe' @('--manage', 'Ubuntu', '--set-default-user', $linuxName)
    }
    Invoke-Linux 'root' $linuxNix @{ROBO_USER=$linuxName}

    if (-not (Test-Path -LiteralPath (Join-Path $target '.git'))) {
        & gh.exe auth status --hostname github.com
        if ($LASTEXITCODE -ne 0) {
            Invoke-Native 'gh.exe' @('auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web')
        }
    }
    $linuxPath = ((& wsl.exe -d Ubuntu -u $linuxName -- wslpath -a -u $target) -join '').Trim()
    if ($LASTEXITCODE -ne 0 -or -not $linuxPath) { throw 'Could not translate the checkout path for WSL.' }
    $ghPath = (Get-Command gh.exe -ErrorAction Stop).Source
    $linuxGhPath = ((& wsl.exe -d Ubuntu -u $linuxName -- wslpath -a -u $ghPath) -join '').Trim()
    if ($LASTEXITCODE -ne 0 -or -not $linuxGhPath) { throw 'Could not translate the GitHub CLI path for WSL.' }
    Invoke-Linux $linuxName $linuxClone @{ROBO_REPO=$linuxPath;ROBO_GH=$linuxGhPath}
    Invoke-Linux $linuxName $linuxUser @{ROBO_REPO=$linuxPath}
    Write-Host "`nSetup passed: Nix shell, dependency installation, build, and type checks." -ForegroundColor Green
    Write-Host 'Start from PowerShell:'
    Write-Host ('  wsl -d Ubuntu --cd "' + $linuxPath + '"')
    Write-Host 'Then run: process-compose'
    Write-Host 'Client: http://localhost:5173'
    Write-Host 'Setup does not start the services or install the production self-signed certificate.'
    exit 0
} catch {
    Write-Host ("`nSetup stopped: " + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Resolve the error and rerun this file. Existing checkouts and WSL distributions are preserved.'
    exit 1
}
