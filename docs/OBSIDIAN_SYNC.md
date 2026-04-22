# Obsidian vault sync (Syncthing) – VPS ↔ laptop

The bot runs on the VPS and needs access to your Obsidian vault. Because the VPS can’t read your laptop’s disk directly, we sync a copy of the vault to the VPS with **Syncthing**. The bot uses that synced folder; Syncthing keeps it in sync with your laptop.

## What’s already done on the VPS

- Syncthing is installed and running as `syncthing@root`.
- Vault folder on the server: **`/opt/telegram-assistant/vault`**
- Syncthing folder ID on the server: **`obsidian-vault`** (label: “Obsidian”).
- **VPS device ID** (use this when adding the server from your laptop):

  **`KHCCRQV-PKQEG7D-4I3HEG3-JQXJXWB-FQW5AGY-Q3QII2W-O2B5XPZ-ZBTM5AR`**

## 1. On the server: set the bot’s vault path

On the VPS, in `/opt/telegram-assistant/.env`, set:

```bash
OBSIDIAN_VAULT_PATH=/opt/telegram-assistant/vault
```

Optional (only if your vault uses different folder names):

```bash
OBSIDIAN_DAILY_FOLDER=Daily
OBSIDIAN_PENDING_FOLDER=Pending
```

Then restart the bot so it picks up the path:

```bash
sudo systemctl restart telegram-assistant
```

(Do this **after** you’ve paired and synced at least once, so the vault dir has content.)

## 2. On your laptop: install Syncthing

- **macOS:** `brew install syncthing` or download from [syncthing.net](https://syncthing.net).
- **Windows:** Download the installer from [syncthing.net](https://syncthing.net).
- Start Syncthing (it usually opens the web UI at http://127.0.0.1:8384).

## 3. Add the VPS as a device

1. In the Syncthing web UI on your laptop, click **“Add Remote Device”**.
2. **Device ID:** paste the VPS device ID:
   ```
   KHCCRQV-PKQEG7D-4I3HEG3-JQXJXWB-FQW5AGY-Q3QII2W-O2B5XPZ-ZBTM5AR
   ```
3. **Device name:** e.g. `personal-assistant` (optional).
4. Leave the rest as default and save. The VPS may take a minute to show as “connected” (it uses “dynamic” discovery).

## 4. Share your Obsidian vault with the VPS

1. In Syncthing on your laptop, click **“Add Folder”**.
2. **Folder path:** choose your **actual Obsidian vault folder** (the one Obsidian opens).
3. **Folder label:** e.g. `Obsidian` (optional).
4. Under **Sharing**, check the **personal-assistant** (VPS) device.
5. Save. When Syncthing asks to “Add folder on remote device?”, it will create a folder on the VPS. **Set the remote folder path to:**
   **`/opt/telegram-assistant/vault`**
6. Confirm. Syncthing will sync: your laptop vault ↔ `/opt/telegram-assistant/vault` on the VPS.

## 5. Check that the bot can see the vault

- Wait for the first sync to finish (watch the Syncthing UI).
- On the VPS, you should see your vault files under `/opt/telegram-assistant/vault`.
- Ensure `OBSIDIAN_VAULT_PATH=/opt/telegram-assistant/vault` is in the bot’s `.env` and restart the bot (see step 1).
- In Telegram, ask the bot to list categories or create a note; it should use the synced vault.

## Optional: open the VPS Syncthing UI from your laptop

From your laptop:

```bash
ssh -L 8384:127.0.0.1:8384 root@192.248.158.86
```

Then open http://127.0.0.1:8384 in your browser. You’ll see the VPS Syncthing; you may need the API key from the VPS config if it asks for auth. To find it:

```bash
ssh root@192.248.158.86 "grep apikey /root/.config/syncthing/config.xml"
```

## Troubleshooting

- **Bot says “OBSIDIAN_VAULT_PATH is not configured”**  
  Add `OBSIDIAN_VAULT_PATH=/opt/telegram-assistant/vault` to `/opt/telegram-assistant/.env` on the VPS and restart the bot.

- **VPS and laptop don’t connect**  
  Ensure the VPS has outbound internet (Syncthing uses relays if it can’t reach you directly). Firewall: Syncthing uses **TCP 22000** and **UDP 22000**; opening these on the VPS can help but isn’t required if relays work.

- **Sync is slow or stuck**  
  In both UIs, check for conflicts or “out of sync” messages. Large vaults can take a while for the first sync.

- **Obsidian and the bot see different content**  
  Syncthing syncs in the background; wait a few seconds after editing on one side and refresh or re-ask on the other.
