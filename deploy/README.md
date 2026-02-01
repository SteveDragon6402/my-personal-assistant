# Deploy from Cursor

**What’s going on:** The deploy script has to log into your server. Right now it can’t, because the server doesn’t trust this computer yet.

**What we’re doing:** We give the server your “SSH key” once (you type the root password that one time). After that, this computer can log in without a password, and the deploy script will work.

---

Do this **once**, in Cursor’s terminal (bottom panel → “Terminal” or `` Ctrl+` ``).

**Step 1 – Copy your key to the server**

Paste this and press Enter:

```bash
ssh-copy-id root@192.248.158.86
```

When it asks for a password, type the **root password for your VPS** (the one you use for `ssh root@192.248.158.86`). You won’t need to type it again for deploy.

**Step 2 – Deploy**

From your project folder, run:

```bash
cd /Users/stevedragon/my-personal-assistant && ./deploy.sh
```

That’s it. The script will copy your code to the server, install, build, and restart the bot.

---

**If you see “No identities found”:** you don’t have an SSH key yet. Create one (no passphrase, just press Enter twice if it asks), then do Step 1:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""
ssh-copy-id root@192.248.158.86
```
