/* Cuota Justa · js/06-camisetas.js
   Mercado · camisetas con los colores de cada club y los 30 equipos de la NBA.
   Script clásico (no módulo): comparte el ámbito global con los demás y se carga en
   el orden de index.html. */
"use strict";
/* ============================ CAMISETAS ============================ */
// Silueta genérica rellenada con los colores de cada club. No son las equipaciones
// reales de la temporada ni llevan escudo: solo el color con el que juega cada equipo.
const PATRON = {
  sol: () => '',
  ray: (a, b) => [1, 3].map(i => `<rect x="${(7.4 + i * 1.84).toFixed(2)}" y="4.4" width="1.84" height="15.6" fill="${b}"/>`).join('')
       + `<rect x="16.6" y="4.4" width="0" height="0" fill="${b}"/>`,
  hor: (a, b) => [1, 3, 5].map(i => `<rect x="7.4" y="${(4.4 + i * 2.6).toFixed(2)}" width="9.2" height="2.6" fill="${b}"/>`).join(''),
  mit: (a, b) => `<rect x="12" y="4.4" width="4.6" height="15.6" fill="${b}"/>`,
  cen: (a, b) => `<rect x="11" y="4.4" width="2" height="15.6" fill="${b}"/>`,
  ban: (a, b) => `<g clip-path="url(#camCuerpo)"><path d="M3.5 18.5 19.5 2.5" stroke="${b}" stroke-width="4.2" fill="none"/></g>`
};
const CAM_NEUTRA = ['sol', '#c6ccd6', '#aab3c0'];

function camiseta(kit, titulo){
  const [p, a, b, m] = kit || CAM_NEUTRA;
  const mangas = m || (p === 'sol' || p === 'ban' || p === 'cen' ? a : b);
  return `<svg class="cam" viewBox="0 0 24 24" role="img"><title>${esc(titulo)}</title>
    <path d="M8.8 3.2 3.6 6.2 5.5 10.8 7.4 9.9 7.4 4.6Z" fill="${mangas}"/>
    <path d="M15.2 3.2 20.4 6.2 18.5 10.8 16.6 9.9 16.6 4.6Z" fill="${mangas}"/>
    <path d="M8.8 3.2 12 4.8 15.2 3.2 16.6 4.6 16.6 20 7.4 20 7.4 4.6Z" fill="${a}"/>
    ${(PATRON[p] || PATRON.sol)(a, b)}
    <path d="M8.8 3.2 12 4.8 15.2 3.2 20.4 6.2 18.5 10.8 16.6 9.9 16.6 20 7.4 20 7.4 9.9 5.5 10.8 3.6 6.2Z"
          fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width=".75" stroke-linejoin="round"/>
  </svg>`;
}

/* --- colores de cada club: [patrón, color base, color secundario, mangas?] --- */
const EQUIPOS_RAW = [
  // España
  ['Real Madrid','', ['sol','#FFFFFF','#D9DEE6'], ['sol','#1A1A1A','#FEBE10']],
  ['Barcelona','fc barcelona|barca|barça', ['ray','#A50044','#004D98'], ['sol','#FFE14D','#004D98']],
  ['Atlético de Madrid','atletico madrid|atleti|club atletico de madrid', ['ray','#FFFFFF','#CB3524','#272E61'], ['sol','#272E61','#CB3524']],
  ['Athletic Club','athletic bilbao|athletic de bilbao', ['ray','#FFFFFF','#EE2523'], ['sol','#1A1A1A','#EE2523']],
  ['Real Sociedad','real sociedad de futbol', ['ray','#FFFFFF','#0B4EA2'], ['sol','#2B2B2B','#0B4EA2']],
  ['Sevilla','sevilla fc', ['sol','#FFFFFF','#D81920'], ['sol','#D81920','#FFFFFF']],
  ['Real Betis','betis|real betis balompie', ['ray','#FFFFFF','#00954C'], ['sol','#1A1A1A','#00954C']],
  ['Valencia','valencia cf', ['sol','#FFFFFF','#F18A00'], ['sol','#1A1A1A','#F18A00']],
  ['Villarreal','villarreal cf', ['sol','#FFE667','#005187'], ['sol','#005187','#FFE667']],
  ['Celta de Vigo','celta|rc celta', ['sol','#8AC3EE','#FFFFFF'], ['sol','#B01C2E','#FFFFFF']],
  ['Osasuna','ca osasuna', ['sol','#D81E05','#0A2D6E'], ['sol','#FFFFFF','#D81E05']],
  ['Rayo Vallecano','rayo', ['ban','#FFFFFF','#E53027'], ['sol','#1A1A1A','#E53027']],
  ['Getafe','getafe cf', ['sol','#005999','#FFFFFF'], ['sol','#FFFFFF','#005999']],
  ['Mallorca','rcd mallorca', ['ray','#E20613','#1A1A1A'], ['sol','#FFFFFF','#E20613']],
  ['Alavés','deportivo alaves', ['ray','#FFFFFF','#0761AF'], ['sol','#0761AF','#FFFFFF']],
  ['Espanyol','rcd espanyol', ['ray','#FFFFFF','#0072CE'], ['sol','#1A1A1A','#0072CE']],
  ['Girona','girona fc', ['ray','#FFFFFF','#D6001C'], ['sol','#1B2A49','#D6001C']],
  ['Las Palmas','ud las palmas', ['sol','#FFDD00','#004B87'], ['sol','#004B87','#FFDD00']],
  ['Leganés','cd leganes', ['ray','#FFFFFF','#005BAC'], ['sol','#005BAC','#FFFFFF']],
  ['Levante','levante ud', ['ray','#00539F','#8B1538'], ['sol','#FFFFFF','#00539F']],
  ['Valladolid','real valladolid', ['ray','#FFFFFF','#6C2C7B'], ['sol','#6C2C7B','#FFFFFF']],
  ['Real Oviedo','oviedo', ['sol','#004B96','#FFFFFF'], ['sol','#FFFFFF','#004B96']],
  ['Deportivo de A Coruña','deportivo la coruna|depor|rc deportivo|deportivo coruna', ['ray','#FFFFFF','#0067B1'], ['sol','#1A1A1A','#0067B1']],
  ['Sporting de Gijón','sporting gijon|real sporting', ['ray','#FFFFFF','#E4002B'], ['sol','#1B3C7A','#FFFFFF']],
  ['Racing de Santander','racing santander|real racing club', ['ray','#FFFFFF','#009639'], ['sol','#1A1A1A','#009639']],
  ['Zaragoza','real zaragoza', ['sol','#FFFFFF','#124191'], ['sol','#124191','#FFFFFF']],
  ['Almería','ud almeria', ['ray','#FFFFFF','#D50032'], ['sol','#1A2A6C','#D50032']],
  ['Cádiz','cadiz cf', ['sol','#FFD100','#0069B4'], ['sol','#0069B4','#FFD100']],
  ['Granada','granada cf', ['hor','#FFFFFF','#C8102E'], ['sol','#1A1A1A','#C8102E']],
  ['Eibar','sd eibar', ['ray','#004B8D','#8B1A32'], ['sol','#FFFFFF','#004B8D']],
  ['Huesca','sd huesca', ['sol','#003DA5','#FFFFFF'], ['sol','#FFFFFF','#003DA5']],
  ['Albacete','albacete balompie', ['sol','#FFFFFF','#1A1A1A'], ['sol','#1A1A1A','#FFFFFF']],
  ['Burgos','burgos cf', ['sol','#FFFFFF','#1A1A1A'], ['sol','#1A1A1A','#FFFFFF']],
  ['Castellón','cd castellon', ['ray','#FFFFFF','#1A1A1A'], ['sol','#E30613','#FFFFFF']],
  ['Córdoba','cordoba cf', ['ray','#FFFFFF','#007A33'], ['sol','#007A33','#FFFFFF']],
  ['Elche','elche cf', ['ray','#FFFFFF','#007A33'], ['sol','#1A1A1A','#007A33']],
  ['Málaga','malaga cf', ['ray','#FFFFFF','#003DA5'], ['sol','#1A1A1A','#003DA5']],
  ['Mirandés','cd mirandes', ['ray','#C8102E','#1A1A1A'], ['sol','#FFFFFF','#C8102E']],
  ['Tenerife','cd tenerife', ['sol','#FFFFFF','#0055A5'], ['sol','#0055A5','#FFFFFF']],
  ['Cartagena','fc cartagena', ['ray','#FFFFFF','#1A1A1A'], ['sol','#E30613','#FFFFFF']],
  ['Sabadell','ce sabadell', ['ray','#FFFFFF','#003F8E'], ['sol','#003F8E','#FFFFFF']],
  ['Racing de Ferrol','racing ferrol', ['ray','#FFFFFF','#009639'], ['sol','#009639','#FFFFFF']],
  // Inglaterra
  ['Manchester United','man united|manchester utd|man utd', ['sol','#DA291C','#FBE122'], ['sol','#FFFFFF','#DA291C']],
  ['Manchester City','man city', ['sol','#6CABDD','#FFFFFF'], ['sol','#5A1230','#6CABDD']],
  ['Liverpool','liverpool fc', ['sol','#C8102E','#F6EB61'], ['sol','#FFFFFF','#C8102E']],
  ['Arsenal','arsenal fc', ['sol','#EF0107','#FFFFFF','#FFFFFF'], ['sol','#FDE100','#1A1A1A']],
  ['Chelsea','chelsea fc', ['sol','#034694','#FFFFFF'], ['sol','#FFFFFF','#034694']],
  ['Tottenham','tottenham hotspur|spurs', ['sol','#FFFFFF','#132257'], ['sol','#132257','#FFFFFF']],
  ['Newcastle','newcastle united', ['ray','#FFFFFF','#241F20'], ['sol','#1B4D8F','#FFFFFF']],
  ['Everton','everton fc', ['sol','#003399','#FFFFFF'], ['sol','#FFFFFF','#003399']],
  ['Aston Villa','villa', ['sol','#670E36','#95BFE5','#95BFE5'], ['sol','#FFFFFF','#670E36']],
  ['West Ham','west ham united', ['sol','#7A263A','#1BB1E7','#1BB1E7'], ['sol','#FFFFFF','#7A263A']],
  ['Brighton','brighton hove albion', ['ray','#FFFFFF','#0057B8'], ['sol','#1A1A1A','#0057B8']],
  ['Fulham','fulham fc', ['sol','#FFFFFF','#1A1A1A','#1A1A1A'], ['sol','#1A1A1A','#FFFFFF']],
  ['Wolves','wolverhampton', ['sol','#FDB913','#1A1A1A'], ['sol','#FFFFFF','#FDB913']],
  ['Brentford','brentford fc', ['ray','#FFFFFF','#E30613'], ['sol','#1A1A1A','#E30613']],
  ['Crystal Palace','palace', ['ray','#1B458F','#C4122E'], ['sol','#FFFFFF','#1B458F']],
  ['Nottingham Forest','nottingham', ['sol','#DD0000','#FFFFFF'], ['sol','#FFFFFF','#DD0000']],
  ['Bournemouth','afc bournemouth', ['ray','#DA291C','#1A1A1A'], ['sol','#FFFFFF','#DA291C']],
  ['Leeds','leeds united', ['sol','#FFFFFF','#1D428A'], ['sol','#1D428A','#FFE100']],
  ['Burnley','burnley fc', ['sol','#6C1D45','#97D6EA'], ['sol','#FFFFFF','#6C1D45']],
  ['Sunderland','sunderland afc', ['ray','#FFFFFF','#EB172B'], ['sol','#1A1A1A','#EB172B']],
  // Italia
  ['Juventus','juve', ['ray','#FFFFFF','#1A1A1A'], ['sol','#1A1A1A','#FFFFFF']],
  ['Inter','inter de milan|internazionale|inter milan', ['ray','#0068A8','#1A1A1A'], ['sol','#FFFFFF','#0068A8']],
  ['Milan','ac milan', ['ray','#FB090B','#1A1A1A'], ['sol','#FFFFFF','#FB090B']],
  ['Nápoles','napoli|ssc napoli', ['sol','#12A0D7','#FFFFFF'], ['sol','#FFFFFF','#12A0D7']],
  ['Roma','as roma', ['sol','#8E1F2F','#F0BC42'], ['sol','#FFFFFF','#8E1F2F']],
  ['Lazio','ss lazio', ['sol','#87D8F7','#FFFFFF'], ['sol','#FFFFFF','#87D8F7']],
  ['Atalanta','atalanta bc', ['ray','#1B3A6B','#1A1A1A'], ['sol','#FFFFFF','#1B3A6B']],
  ['Fiorentina','acf fiorentina', ['sol','#482E92','#FFFFFF'], ['sol','#FFFFFF','#482E92']],
  ['Bolonia','bologna', ['ray','#D2122E','#1A2F5A'], ['sol','#FFFFFF','#D2122E']],
  ['Torino','torino fc', ['sol','#881600','#FFFFFF'], ['sol','#FFFFFF','#881600']],
  ['Udinese','udinese calcio', ['ray','#FFFFFF','#1A1A1A'], ['sol','#1A1A1A','#FFFFFF']],
  ['Génova','genoa|genoa cfc', ['mit','#B01C2E','#1B3A6B'], ['sol','#FFFFFF','#B01C2E']],
  ['Sassuolo','us sassuolo', ['ray','#00A752','#1A1A1A'], ['sol','#FFFFFF','#00A752']],
  ['Lecce','us lecce', ['ray','#FFE14D','#B01C2E'], ['sol','#FFFFFF','#B01C2E']],
  // Alemania
  ['Bayern','bayern munich|bayern de munich|bayern munchen', ['sol','#DC052D','#FFFFFF'], ['sol','#FFFFFF','#DC052D']],
  ['Borussia Dortmund','dortmund|bvb', ['sol','#FDE100','#1A1A1A'], ['sol','#1A1A1A','#FDE100']],
  ['RB Leipzig','leipzig', ['sol','#FFFFFF','#DD0741'], ['sol','#DD0741','#FFFFFF']],
  ['Leverkusen','bayer leverkusen', ['sol','#E32221','#1A1A1A'], ['sol','#FFFFFF','#E32221']],
  ['Eintracht Frankfurt','frankfurt|eintracht', ['sol','#1A1A1A','#E1000F'], ['sol','#FFFFFF','#1A1A1A']],
  ['Stuttgart','vfb stuttgart', ['sol','#FFFFFF','#E32219'], ['sol','#E32219','#FFFFFF']],
  ['Wolfsburgo','wolfsburg', ['sol','#65B32E','#FFFFFF'], ['sol','#FFFFFF','#65B32E']],
  ['Mönchengladbach','monchengladbach|gladbach|borussia monchengladbach', ['sol','#FFFFFF','#00A94F'], ['sol','#1A1A1A','#00A94F']],
  ['Werder Bremen','bremen', ['sol','#1D9053','#FFFFFF'], ['sol','#FFFFFF','#1D9053']],
  ['Friburgo','freiburg|sc friburgo', ['sol','#E2001A','#1A1A1A'], ['sol','#FFFFFF','#E2001A']],
  ['Hoffenheim','tsg hoffenheim', ['sol','#1961B5','#FFFFFF'], ['sol','#FFFFFF','#1961B5']],
  ['Mainz','mainz 05', ['sol','#C3141E','#FFFFFF'], ['sol','#FFFFFF','#C3141E']],
  // Francia
  ['PSG','paris saint germain|paris sg|paris', ['cen','#0B2C5C','#DA291C'], ['sol','#FFFFFF','#0B2C5C']],
  ['Marsella','marseille|olympique de marsella|om', ['sol','#FFFFFF','#2FAEE0'], ['sol','#2FAEE0','#FFFFFF']],
  ['Lyon','olympique de lyon|olympique lyonnais', ['sol','#FFFFFF','#1A4F9D'], ['sol','#1A4F9D','#FFFFFF']],
  ['Mónaco','monaco|as monaco', ['mit','#E63946','#FFFFFF'], ['sol','#FFFFFF','#E63946']],
  ['Lille','losc lille', ['sol','#E4022E','#1A2E5A'], ['sol','#FFFFFF','#E4022E']],
  ['Niza','nice|ogc niza', ['sol','#E4022E','#1A1A1A'], ['sol','#FFFFFF','#E4022E']],
  ['Rennes','stade rennais', ['ray','#E4022E','#1A1A1A'], ['sol','#FFFFFF','#E4022E']],
  ['Lens','rc lens', ['ray','#FFE14D','#E4022E'], ['sol','#1A1A1A','#FFE14D']],
  // Portugal y Países Bajos
  ['Benfica','sl benfica', ['sol','#E20613','#FFFFFF'], ['sol','#FFFFFF','#E20613']],
  ['Oporto','porto|fc porto', ['ray','#FFFFFF','#004B9F'], ['sol','#1A1A1A','#004B9F']],
  ['Sporting de Lisboa','sporting cp|sporting lisboa|sporting portugal', ['hor','#008057','#FFFFFF'], ['sol','#1A1A1A','#008057']],
  ['Ajax','afc ajax', ['cen','#FFFFFF','#D2122E'], ['sol','#1A1A1A','#D2122E']],
  ['PSV','psv eindhoven', ['sol','#ED1C24','#FFFFFF'], ['sol','#FFFFFF','#ED1C24']],
  ['Feyenoord','feyenoord rotterdam', ['mit','#FFFFFF','#DA291C'], ['sol','#1A1A1A','#DA291C']]
];

const normNom = x => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const EQUIPOS = EQUIPOS_RAW.map(([nombre, alias, k1, k2]) => ({
  nombre, k1, k2,
  claves: [normNom(nombre)].concat((alias || '').split('|').map(normNom).filter(Boolean)),
  tokens: normNom(nombre).split(' ')
}));
const ALIAS = new Map();
EQUIPOS.forEach(e => e.claves.forEach(c => { if (!ALIAS.has(c)) ALIAS.set(c, e); }));

function equipoDe(nombre){
  const n = normNom(nombre);
  if (!n) return null;
  if (ALIAS.has(n)) return ALIAS.get(n);
  const t = n.split(' ');
  let mejor = null, puntos = 0;
  for (const e of EQUIPOS){
    if (e.tokens.every(x => t.includes(x)) && e.tokens.length > puntos){ mejor = e; puntos = e.tokens.length; }
  }
  return mejor;
}

const aRgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const distColor = (x, y) => { const a = aRgb(x), b = aRgb(y); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); };
// Colores que realmente se ven: en una camiseta lisa, solo el de base.
const coloresVisibles = k => k[0] === 'sol' ? [k[1]] : [k[1], k[2] || k[1]];
// Dos equipaciones chocan si alguno de sus colores visibles se parece demasiado.
function chocan(a, b){
  let m = 999;
  for (const x of coloresVisibles(a)) for (const y of coloresVisibles(b)) m = Math.min(m, distColor(x, y));
  return m < 105;
}

/* ============================ LOS 30 EQUIPOS DE LA NBA ============================
   Desde el 14-09-2026 el baloncesto del panel es SOLO la NBA.

   Esta tabla es el puente entre dos maneras distintas de escribir el mismo equipo:
   · stats.nba.com lo escribe entero y en inglés — «Los Angeles Lakers».
   · Bet365 y Flashscore lo abrevian — «LA Lakers», «BOS Celtics», «GS Warriors».
   Sin el puente, una cuota cargada y su estadística no se encuentran nunca.

   El primer número es el id de equipo de stats.nba.com, que es además el id de
   documento en la colección `nba` de la base: por ahí se emparejan sin depender del
   nombre. Los colores son los de cada franquicia; el dibujo es una camiseta genérica
   sin escudo ni logotipo — esos son marcas registradas y no entran aquí. */
const NBA_RAW = [
  [1610612737,'ATL','Atlanta Hawks','hawks','#E03A3E','#C1D32F'],
  [1610612738,'BOS','Boston Celtics','celtics','#007A33','#BA9653'],
  [1610612751,'BKN','Brooklyn Nets','nets','#1A1A1A','#FFFFFF'],
  [1610612766,'CHA','Charlotte Hornets','hornets','#1D1160','#00788C'],
  [1610612741,'CHI','Chicago Bulls','bulls','#CE1141','#1A1A1A'],
  [1610612739,'CLE','Cleveland Cavaliers','cavaliers|cavs','#860038','#FDBB30'],
  [1610612742,'DAL','Dallas Mavericks','mavericks|mavs','#00538C','#002B5E'],
  [1610612743,'DEN','Denver Nuggets','nuggets','#0E2240','#FEC524'],
  [1610612765,'DET','Detroit Pistons','pistons','#C8102E','#1D42BA'],
  [1610612744,'GSW','Golden State Warriors','warriors|gs warriors','#1D428A','#FFC72C'],
  [1610612745,'HOU','Houston Rockets','rockets','#CE1141','#1A1A1A'],
  [1610612754,'IND','Indiana Pacers','pacers','#002D62','#FDBB30'],
  [1610612746,'LAC','LA Clippers','clippers|los angeles clippers','#C8102E','#1D428A'],
  [1610612747,'LAL','Los Angeles Lakers','lakers|la lakers','#552583','#FDB927'],
  [1610612763,'MEM','Memphis Grizzlies','grizzlies','#5D76A9','#12173F'],
  [1610612748,'MIA','Miami Heat','heat','#98002E','#F9A01B'],
  [1610612749,'MIL','Milwaukee Bucks','bucks','#00471B','#EEE1C6'],
  [1610612750,'MIN','Minnesota Timberwolves','timberwolves|wolves','#0C2340','#236192'],
  [1610612740,'NOP','New Orleans Pelicans','pelicans','#0C2340','#C8102E'],
  [1610612752,'NYK','New York Knicks','knicks','#006BB6','#F58426'],
  [1610612760,'OKC','Oklahoma City Thunder','thunder','#007AC1','#EF3B24'],
  [1610612753,'ORL','Orlando Magic','magic','#0077C0','#C4CED4'],
  [1610612755,'PHI','Philadelphia 76ers','76ers|sixers','#006BB6','#ED174C'],
  [1610612756,'PHX','Phoenix Suns','suns','#1D1160','#E56020'],
  [1610612757,'POR','Portland Trail Blazers','trail blazers|blazers','#E03A3E','#1A1A1A'],
  [1610612758,'SAC','Sacramento Kings','kings','#5A2D81','#63727A'],
  [1610612759,'SAS','San Antonio Spurs','spurs','#C4CED4','#1A1A1A'],
  [1610612761,'TOR','Toronto Raptors','raptors','#CE1141','#1A1A1A'],
  [1610612762,'UTA','Utah Jazz','jazz','#002B5C','#F9A01B'],
  [1610612764,'WAS','Washington Wizards','wizards','#002B5C','#E31837']
];

const NBA_EQUIPOS = NBA_RAW.map(([id, abbr, nombre, alias, color, trim]) => {
  const claves = new Set([normNom(nombre), normNom(abbr)]);
  (alias || '').split('|').forEach(a => { const k = normNom(a); if (k){ claves.add(k); claves.add(normNom(abbr + ' ' + a)); } });
  return { id: String(id), abbr, nombre, color, trim, claves: Array.from(claves).filter(Boolean) };
});
const NBA_ALIAS = new Map();
NBA_EQUIPOS.forEach(t => t.claves.forEach(c => { if (!NBA_ALIAS.has(c)) NBA_ALIAS.set(c, t); }));

/* Empareja un nombre suelto con su franquicia. Primero por el nombre entero; si no,
   por el apodo, que en la NBA no se repite: «LA Lakers», «Los Angeles Lakers» y
   «LAL Lakers» caen los tres en Lakers. Si dos apodos distintos aparecen en la misma
   cadena, se devuelve null antes que adivinar. */
function nbaEquipoDe(nombre){
  const n = normNom(nombre);
  if (!n) return null;
  if (NBA_ALIAS.has(n)) return NBA_ALIAS.get(n);
  let hit = null;
  for (const x of n.split(' ')){
    const m = NBA_ALIAS.get(x);
    if (m){ if (hit && hit !== m) return null; hit = m; }
  }
  return hit;
}
const nbaDatosDe = t => (t && S.nba.length) ? (S.nba.find(x => String(x.id) === t.id) || null) : null;

/* La camiseta de baloncesto: sin mangas, con el filo y la cinturilla en el color
   secundario. En la NBA el local juega de blanca y el visitante de color, así que
   aquí no hace falta la lógica de choque del fútbol: se reparte como en la liga. */
function camisetaBasket(base, trim, titulo){
  const cuerpo = 'M8.4 3.4h2.1a1.65 1.65 0 0 0 3 0h2.1l1.5 1.3v5.2h-1.7V20.2H7.6V9.9H5.9V4.7Z';
  return `<svg class="cam" viewBox="0 0 24 24" role="img"><title>${esc(titulo)}</title>
    <path d="${cuerpo}" fill="${base}"/>
    <path d="M7.6 12.4h8.8v1.4H7.6z" fill="${trim}"/>
    <path d="M7.6 18.6h8.8v1.6H7.6z" fill="${trim}"/>
    <path d="${cuerpo}" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width=".75" stroke-linejoin="round"/>
  </svg>`;
}

/* Fútbol: el local de primera; el visitante también salvo que choque, y entonces de
   segunda. Baloncesto: el local de blanca y el visitante de color, que es el reparto
   de verdad de la NBA. Cualquier otro deporte, sin camiseta. */
function camisetasDe(e){
  const dep = e.deporte || '';
  if (SPORTS[1].match.test(dep)){
    const L = nbaEquipoDe(e.local), V = nbaEquipoDe(e.visitante);
    return [
      camisetaBasket('#F2F5FA', L ? L.color : '#aab3c0',
        L ? e.local + ' · equipación local, blanca (' + L.abbr + ')' : e.local + ' · equipo no reconocido en la NBA'),
      camisetaBasket(V ? V.color : '#c6ccd6', V ? V.trim : '#aab3c0',
        V ? e.visitante + ' · equipación de visitante (' + V.abbr + ')' : e.visitante + ' · equipo no reconocido en la NBA')
    ];
  }
  if (!SPORTS[0].match.test(dep)) return ['', ''];
  const L = equipoDe(e.local), V = equipoDe(e.visitante);
  const kL = L ? L.k1 : null;
  let kV = V ? V.k1 : null, segunda = false;
  if (kL && kV && chocan(kL, kV) && V.k2){ kV = V.k2; segunda = true; }
  return [
    camiseta(kL, L ? e.local + ' · primera equipación' : e.local + ' · colores no registrados'),
    camiseta(kV, V ? e.visitante + (segunda ? ' · segunda equipación (cambia por choque de colores)' : ' · primera equipación')
                  : e.visitante + ' · colores no registrados')
  ];
}
