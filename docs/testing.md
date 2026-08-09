# Testing

Run local checks:

```bash
npm run build
PYTHONPYCACHEPREFIX=/private/tmp/omnimarket-pycache python3 -m py_compile contracts/omnimarket.py
```

Run Studio tests from `STUDIO_BRADBURY_TEST_PLAN.md`.

Minimum submission evidence:

- deployed Bradbury contract address
- deploy transaction hash
- `create_market` accepted transaction
- `buy_position` accepted transaction
- `get_price_bps` result after trade
- `admin_resolve_for_studio` accepted transaction
- `get_market` resolved state
- `preview_payout` result
- `claim_winnings` accepted transaction
