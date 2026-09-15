# Cómo enchufarlo a `deportes-odds-api`

Cuatro pasos. Ninguno necesita clave de API — el último sí necesita cuotas.

## 1. Copiar el paquete dentro del backend

```bash
cp -r odds-engine  deportes-odds-api/packages/odds-engine
```

En el `package.json` del backend:

```json
"dependencies": { "@deportes/odds-engine": "file:./packages/odds-engine" }
```

No añade ninguna dependencia nueva: el motor no tiene ninguna.

## 2. La ruta

```ts
import { analyseFeeds, withConfig } from '@deportes/odds-engine';

const cfg = withConfig({
  optimizer: { targetOdds: 2.5120, targetTolerance: 0.06 },
  filters:   { maxLegsPerMatch: 3 },
});

app.post('/api/analysis/combinations', (req, res) => {
  const out = analyseFeeds({
    feeds: req.body.feeds,     // [{ match, blocks, participants }]
    bookmaker: process.env.ODDS_BOOKMAKER ?? 'Bet365',
    universe: 'top',
  }, cfg);
  res.json(out);
});
```

`blocks` es literalmente `data.findOddsByEventId.odds` tal y como llega del
feed, sin tocar. `participants` es el `{home, away}` de `_hash=ope2`.

## 3. Comprobar sin cuotas reales

```bash
cd packages/odds-engine && npm test        # 139 tests
npx tsx examples/demo.ts                   # los cinco resultados que importan
```

## 4. Lo que hay que mirar el día que haya clave

En este orden, y parando en el primero que falle:

1. **¿Bet365 está en tu plan?** `GET /bookmakers/selected`. Su plan gratuito da
   2 casas recreativas y las *sharp* son de pago. Si no está, lo demás sobra.
2. **¿De qué Bet365 son esos precios?** Contrastar cinco partidos contra
   bet365.es. Las agregadoras publican el feed internacional, y tú apuestas en
   el español, que es otra licencia y otros precios.
3. **¿Cuadra el margen?** El adaptador tira cualquier grupo cuyo margen no esté
   entre el objetivo y el objetivo +35 %. Si te tira muchos, el mapeo de
   mercados está mal, no las cuotas.
4. **Entonces, y solo entonces**, mirar lo que dice `optimisation.verdict`.

## Lo que el motor te va a decir casi siempre

`NO EXISTE COMBINACIÓN VERDE CON SUFICIENTE CONFIANZA`.

No es un fallo. Con lo medido en este proyecto, ninguna estrategia tiene valor
esperado positivo demostrado. Lo que sí puede darte, y nadie ha mirado todavía,
es el cociente `P_conjunta_modelo / Π p_i` en las combinadas del mismo partido:
si Bet365 multiplica cuotas de patas que no son independientes, ahí hay un
precio mal puesto. Ese número sale en `joint.correlation.pairs[].ratio`.
