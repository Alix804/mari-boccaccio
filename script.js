const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzSbtexidApEFGaot3KqTQe4-FRJFrwLxgtfLSez1dh_6MwIbPtiOxUt6a8bNoFp9jr/exec";

let livelloCorrente = "principale"; // "principale" o ID del padre
let markerAttivo = null;

// --- DATA MANAGER ---
const DataManager = {
    db: [],
    async load() {
        try {
            const response = await fetch(WEB_APP_URL);
            this.db = await response.json();
        } catch (e) {
            console.warn("Errore caricamento remote, tentando fallback locale:", e);
            try {
                const respLocal = await fetch('./assets/data.json');
                if (respLocal.ok) {
                    this.db = await respLocal.json();
                } else {
                    this.db = [];
                }
            } catch (e2) {
                console.error("Fallback locale non disponibile:", e2);
                this.db = [];
            }
        }
    },
    getAll() {
        return this.db;
    },
    getById(id) {
        return this.db.find(m => String(m.id) === String(id));
    },
    getChildren(parentId) {
        return this.db.filter(m => String(m.parent_id) === String(parentId));
    },
    getRoot() {
        return this.db.filter(m => !m.parent_id || m.parent_id === "");
    }
};

// Inizializza Panzoom
const elem = document.getElementById('scene-boccaccio');
const pz = Panzoom(elem, { 
    maxScale: 5, 
    minScale: 1,
    contain: 'outside', 
    canvas: true,
    step: 0.5
});
elem.parentElement.addEventListener('wheel', pz.zoomWithWheel);

// --- FUNZIONI DI RENDERING MODULARI ---

function renderMappa(database, livelloCorrente) {
    const svg = document.getElementById('svg-boccaccio');
    svg.innerHTML = "";
    const fragment = document.createDocumentFragment();
    for (const item of database) {
        const isFiglio = item.parent_id && item.parent_id !== "";
        const deveApparire = (livelloCorrente === "principale")
            ? !isFiglio
            : String(item.parent_id) === String(livelloCorrente);
        if (deveApparire && item.punti_svg) {
            if (livelloCorrente === "principale") {
                fragment.appendChild(renderPin(item));
            } else {
                fragment.appendChild(renderArea(item));
            }
        }
    }
    svg.appendChild(fragment);
}

function renderPin(mare) {
    // Calcola baricentro
    const punti = mare.punti_svg.split(" ").map(p => {
        const coords = p.split(",");
        return { x: parseInt(coords[0]), y: parseInt(coords[1]) };
    });
    const centroX = punti.reduce((sum, p) => sum + p.x, 0) / punti.length;
    const centroY = punti.reduce((sum, p) => sum + p.y, 0) / punti.length;
    // Determina se è un mare padre (nessun parent_id o parent_id vuoto)
    const isPadre = !mare.parent_id || mare.parent_id === "";
    // Colori
    const fillColor = isPadre ? "#1565c0" : "#4fc3f7";
    const strokeColor = isPadre ? "#0d47a1" : "#039be5";
    // Crea un gruppo SVG per l'icona ancora
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "map-pin");
    g.setAttribute("tabindex", "0");
    g.setAttribute("aria-label", (mare.name_it || mare.name_lat || "Pin mappa"));
    g.setAttribute("style", `cursor:pointer`);
    // Path ancora SVG (più grande)
    const anchorPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    anchorPath.setAttribute("d", "M0,-10 v8 m0 0 c0,6 8,6 8,0 m-8,0 c0,6 -8,6 -8,0 m8,0 a2,2 0 1,1 -4,0 a2,2 0 1,1 4,0 z M0,-10 l-3,3 m3,-3 l3,3");
    anchorPath.setAttribute("fill", fillColor);
    anchorPath.setAttribute("stroke", strokeColor);
    anchorPath.setAttribute("stroke-width", "2.2");
    anchorPath.setAttribute("stroke-linecap", "round");
    anchorPath.setAttribute("stroke-linejoin", "round");
    anchorPath.setAttribute("transform", `translate(${centroX},${centroY}) scale(2.1)`);
    g.appendChild(anchorPath);
    // Tooltip custom
    g.addEventListener('mouseenter', (e) => showTooltip(e, mare.name_it || mare.name_lat));
    g.addEventListener('mouseleave', hideTooltip);
    g.addEventListener('focus', (e) => showTooltip(e, mare.name_it || mare.name_lat));
    g.addEventListener('blur', hideTooltip);
    // Click/tap
    g.onclick = (e) => { e.stopPropagation(); renderDettagli(mare); focusPin(g); };
    // Tastiera
    g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            renderDettagli(mare);
            focusPin(g);
        }
    });
    return g;
}

function renderArea(mare) {
    const points = mare.punti_svg.split(" ").map(p => {
        const coords = p.split(",");
        return { x: parseInt(coords[0]), y: parseInt(coords[1]) };
    });
    const pathStr = pointsToSmoothPath(points, true);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathStr);
    path.setAttribute("class", "area-interna");
    path.setAttribute("tabindex", "0");
    path.setAttribute("aria-label", (mare.name_it || mare.name_lat || "Area mappa"));
    // Tooltip custom
    path.addEventListener('mouseenter', (e) => showTooltip(e, mare.name_it || mare.name_lat));
    path.addEventListener('mouseleave', hideTooltip);
    path.addEventListener('focus', (e) => showTooltip(e, mare.name_it || mare.name_lat));
    path.addEventListener('blur', hideTooltip);
    // Click/tap
    path.onclick = (e) => { e.stopPropagation(); renderDettagli(mare); focusPin(path); };
    // Tastiera
    path.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            renderDettagli(mare);
            focusPin(path);
        }
    });
    return path;
}
// Tooltip custom
let tooltipDiv = null;
function showTooltip(e, text) {
    hideTooltip();
    tooltipDiv = document.createElement('div');
    tooltipDiv.className = 'custom-tooltip';
    tooltipDiv.innerText = text;
    document.body.appendChild(tooltipDiv);
    const rect = (e.target.getBoundingClientRect ? e.target.getBoundingClientRect() : {left:0,top:0,width:0,height:0});
    tooltipDiv.style.left = (rect.left + rect.width/2 - tooltipDiv.offsetWidth/2) + 'px';
    tooltipDiv.style.top = (rect.top - 32) + 'px';
}
function hideTooltip() {
    if (tooltipDiv) {
        tooltipDiv.remove();
        tooltipDiv = null;
    }
}

// Focus visivo
function focusPin(el) {
    // Rimuovi focus da altri
    document.querySelectorAll('.map-pin[aria-selected], .area-interna[aria-selected]').forEach(e => e.removeAttribute('aria-selected'));
    el.setAttribute('aria-selected', 'true');
}

function renderDettagli(mare) {
    // Mostra la modale e aggiorna i dettagli
    const modal = document.getElementById('info-modal');
    modal.style.display = 'block';
    document.getElementById('m-nome').innerText = mare.name_it || "Ignoto";
    document.getElementById('m-lat').innerText = mare.name_lat || "-";
    document.getElementById('m-mod').innerText = mare.denominazione_moderna || "-";
    document.getElementById('m-info-extra').innerText = mare.tipologia ? ('Tipologia: ' + mare.tipologia) : '';
    // Evidenzia area
    const svg = document.getElementById('svg-boccaccio');
    const vecchiaArea = document.getElementById('area-evidenziata-temp');
    if (vecchiaArea) vecchiaArea.remove();
    if (mare.punti_svg) {
        const points = mare.punti_svg.split(" ").map(p => {
            const coords = p.split(",");
            return { x: parseInt(coords[0]), y: parseInt(coords[1]) };
        });
        const pathStr = pointsToSmoothPath(points, true);
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", pathStr);
        path.setAttribute("id", "area-evidenziata-temp");
        path.setAttribute("style", "fill:rgba(241, 196, 15, 0.4); stroke:#f1c40f; stroke-width:3; pointer-events:none;");
        svg.appendChild(path);
    }
    renderCitazioni(mare.lista_citazioni);
    renderSubMenu(mare);
    renderMappaModerna(mare);
}
// Trasforma una lista di punti [{x,y},...] in una path SVG smooth (Catmull-Rom to Bezier)
function pointsToSmoothPath(points, closed) {
    if (!points || points.length < 2) return '';
    let d = '';
    const pts = points.slice();
    if (closed) pts.push(points[0]);
    d += `M${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i === 0 ? pts.length - 2 : i - 1];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[(i + 2) % pts.length];
        // Catmull-Rom to Bezier
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    if (closed) d += ' Z';
    return d;
}

function renderCitazioni(lista_citazioni) {
    const container = document.getElementById('citazioni-container');
    container.innerHTML = "";
    if (lista_citazioni && lista_citazioni.length > 0) {
        lista_citazioni.forEach(cit => {
            const box = document.createElement('div');
            const header = document.createElement('p');
            header.style.color = '#8b0000';
            header.style.fontWeight = 'bold';
            header.style.cursor = 'pointer';
            header.textContent = `📖 ${cit.opera} (${cit.reference})`;
            const desc = document.createElement('p');
            desc.style.fontStyle = 'italic';
            desc.style.display = 'none';
            desc.textContent = cit.desc_it ? `"${cit.desc_it}"` : '';
            header.addEventListener('click', (ev) => {
                ev.stopPropagation();
                desc.style.display = desc.style.display === 'none' ? 'block' : 'none';
            });
            box.appendChild(header);
            box.appendChild(desc);
            box.appendChild(document.createElement('hr'));
            container.appendChild(box);
        });
    }
}

function renderSubMenu(mare) {
    const subMenu = document.getElementById('sub-menu-container');
    subMenu.innerHTML = "";
    const figli = DataManager.getChildren(mare.id);
    if (figli.length > 0) {
        const btn = document.createElement('button');
        btn.innerHTML = "🔍 Esplora Mari Interni (" + figli.length + ")";
        btn.className = "btn-esplora";
        btn.onclick = () => entraNelMare(mare);
        subMenu.appendChild(btn);
    }
}

function renderMappaModerna(mare) {
    if (mare.corrispondenza_moderna) {
        const [lat, lng] = mare.corrispondenza_moderna.split(",").map(n => parseFloat(n.trim()));
        if (markerAttivo) map.removeLayer(markerAttivo);
        markerAttivo = L.marker([lat, lng]).addTo(map);
        map.flyTo([lat, lng], 6);
    }
}

// Inizializza Mappa Moderna
let map = L.map('modern-map').setView([38.0, 15.0], 5);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 8
}).addTo(map);


// --- FUNZIONI DI INTERAZIONE (USANO DATA MANAGER E RENDERING) ---

async function caricaApp() {
    await DataManager.load();
    renderMappa(
        livelloCorrente === "principale" ? DataManager.getRoot() : DataManager.getChildren(livelloCorrente),
        livelloCorrente
    );
}

function entraNelMare(mare) {
    livelloCorrente = mare.id;
    // Zoom e pan centrati sull'area selezionata
    const punti = mare.punti_svg.split(" ").map(p => {
        const coords = p.split(",");
        return { x: parseInt(coords[0]), y: parseInt(coords[1]) };
    });
    const minX = Math.min(...punti.map(p => p.x));
    const maxX = Math.max(...punti.map(p => p.x));
    const minY = Math.min(...punti.map(p => p.y));
    const maxY = Math.max(...punti.map(p => p.y));
    const centroX = (minX + maxX) / 2;
    const centroY = (minY + maxY) / 2;
    const scalaZoom = 2.5;
    const temp = document.getElementById('area-evidenziata-temp');
    if (temp) temp.remove();
    pz.zoom(scalaZoom, { animate: true });
    setTimeout(() => {
        pz.pan(
            (500 - centroX) * scalaZoom, 
            (500 - centroY) * scalaZoom, 
            { animate: true }
        );
    }, 150);
    document.getElementById('btn-back-map').style.display = "block";
    renderMappa(DataManager.getChildren(livelloCorrente), livelloCorrente);
}

function tornaAlLivelloPrincipale() {
    livelloCorrente = "principale";
    pz.reset({ animate: true });
    document.getElementById('btn-back-map').style.display = "none";
    renderMappa(DataManager.getRoot(), livelloCorrente);
}

function chiudiModale() {
    const modal = document.getElementById('info-modal');
    modal.style.display = 'none';
}

// Avvio app
caricaApp();