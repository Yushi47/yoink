# yoink

Universal headless file downloader. If a human can click download on it, `yoink` can too.

## Installation

```bash
npm install
npx playwright install chromium
sudo npm install -g tsx
sudo npm install -g .
```

## Usage

```bash
# Basic download
yoink https://gofile.io/d/example

# Download with a password
yoink -p secret https://gofile.io/d/private

# Download to a specific directory
yoink -o ~/Downloads https://gofile.io/d/example

# Several URLs at once (max 3 concurrent)
yoink https://example.com/a https://example.com/b https://example.com/c

# URLs from a file (one per line; lines starting with # are comments)
yoink -f urls.txt

# Combine positional URLs with a file list
yoink -f more.txt https://gofile.io/d/example
```

### Options

| Flag | Name | Description | Default |
|---|---|---|---|
| `-o` | `--output <dir>` | Output directory for the downloaded file | `./downloads` |
| `-p` | `--password <pwd>` | Password for the file | |
| `-t` | `--timeout <ms>` | Timeout in milliseconds (positive integer) | `300000` |
| `-f` | `--file <path>` | Read extra URLs from file | |
| `-h` | `--help` | Display help | |
