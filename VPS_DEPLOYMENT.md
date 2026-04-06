# Déploiement VPS GazDetect — Infos & Procédures

## Infos serveur
- **IP** : 187.77.172.181
- **Hostname** : srv1533747.hstgr.cloud
- **Panel** : CloudPanel → https://187.77.172.181:8443
- **Terminal** : https://int.hostingervps.com/1320/ (via hPanel Hostinger)
- **OS** : Ubuntu avec CloudPanel v2
- **Node.js** : v22.22.2 (via nvm) → `/home/hstgr-srv1533747/.nvm/versions/node/v22.22.2/bin/`

## Application
- **URL** : https://srv1533747.hstgr.cloud
- **Dossier** : `/home/hstgr-srv1533747/htdocs/srv1533747.hstgr.cloud/`
- **Port** : 3000 (Nginx proxy → 127.0.0.1:3000)
- **Process manager** : PM2 (redémarrage automatique en cas de crash)
- **Logs** : `pm2 logs gazdetect` ou `/var/log/gazdetect.log`

## Fichiers importants sur le VPS
- `.env` → `/home/hstgr-srv1533747/htdocs/srv1533747.hstgr.cloud/.env`
- `gazdetect.db` → base de données SQLite (NE PAS supprimer !)
- `uploads/` → fichiers tarifs uploadés (NE PAS supprimer !)
- `update.sh` → `/home/hstgr-srv1533747/update.sh`

## GitHub
- **Repo** : https://github.com/emmanuelatou-ai/gazdetect-prix (privé)
- **Token** : intégré dans update.sh sur le VPS

## Commandes utiles (dans le terminal Hostinger)

### Voir le statut de l'app
```bash
export PATH="/home/hstgr-srv1533747/.nvm/versions/node/v22.22.2/bin:$PATH"
pm2 status
```

### Voir les logs
```bash
pm2 logs gazdetect
```

### Redémarrer manuellement
```bash
export PATH="/home/hstgr-srv1533747/.nvm/versions/node/v22.22.2/bin:$PATH"
pm2 restart gazdetect
```

### Mettre à jour depuis GitHub
```bash
bash /home/hstgr-srv1533747/update.sh
```

## Workflow mise à jour

1. **Modifier le code** sur le PC avec Claude Code
2. **Pousser sur GitHub** :
   ```bash
   git add .
   git commit -m "description"
   git push origin main
   ```
3. **Terminal Hostinger** → coller :
   ```bash
   bash /home/hstgr-srv1533747/update.sh
   ```

## Ce qui est protégé (jamais sur GitHub)
- `backend/.env` (JWT_SECRET, mots de passe)
- `backend/gazdetect.db` (base de données)
- `uploads/` (fichiers tarifs confidentiels)

## Comptes par défaut application
- `admin@gazdetect.com` / Admin2024!
- `commercial@gazdetect.com` / Compta2024!
