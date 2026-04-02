# Deploiement NegotiateAI sur VPS Batiscan

## Prerequis

- VPS avec Batiscan V4 qui tourne (`batiscan-v4_batiscan-network` existe)
- DNS: `negotiateia.batiscan.ch` pointe vers l'IP du VPS
- Cle API Anthropic

## 1. Ajouter le bloc Caddy (avec basic auth)

Dans le Caddyfile de Batiscan-V4, ajouter a la fin :

```caddy
# ============================================================================
# NegotiateAI — simulateur de negociation (protege par basic auth)
# ============================================================================
negotiateia.batiscan.ch {
	basicauth * {
		# Generer le hash: docker exec batiscan_caddy caddy hash-password --plaintext "MOT_DE_PASSE"
		negotiate HASH_ICI
	}
	reverse_proxy negotiateai:3000
}
```

Generer le hash du mot de passe :

```bash
docker exec batiscan_caddy caddy hash-password --plaintext "MotDePasseChoisi"
# Copier le hash dans le Caddyfile
```

Puis recharger Caddy :

```bash
cd /chemin/vers/Batiscan-V4
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

**Login**: `negotiate` / le mot de passe choisi.

## 2. Deployer NegotiateAI

```bash
# Cloner le repo
cd /opt
git clone <repo-url> negotiateai
cd negotiateai

# Configurer
cp .env.example .env
nano .env  # Ajouter ANTHROPIC_API_KEY

# Lancer
docker compose up -d --build

# Verifier
docker compose logs -f
curl http://localhost:3000/api/health
```

## 3. Verifier

```bash
curl -u negotiate:MotDePasseChoisi https://negotiateia.batiscan.ch/api/health
# {"ok":true,"sessions":0}
```

## Mise a jour

```bash
cd /opt/negotiateai
git pull
docker compose up -d --build
```

## Logs

```bash
docker compose logs -f negotiateai
```

## Donnees

Les sessions et la progression sont persistees dans le volume Docker `negotiateai_data`.
Pour backup :

```bash
docker compose exec negotiateai cat /data/sessions.jsonl > backup-sessions.jsonl
docker compose exec negotiateai cat /data/progression.json > backup-progression.json
docker compose exec negotiateai cat /data/analytics.jsonl > backup-analytics.jsonl
```

## Securite

- **Rate limiting** : 30 requetes POST / minute / IP (integre dans l'app)
- **Session cleanup** : TTL 30 min, max 50 sessions actives
- **Basic auth** : via Caddy (pas dans l'app)
- **Analytics** : chaque session est loggee dans `analytics.jsonl`
