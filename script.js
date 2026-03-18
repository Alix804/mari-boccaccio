const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzSbtexidApEFGaot3KqTQe4-FRJFrwLxgtfLSez1dh_6MwIbPtiOxUt6a8bNoFp9jr/exec";

let database = [];
let livelloCorrente = "principale"; // "principale" o ID del padre
let markerAttivo = null;

// Inizializza Panzoom
const elem = document.getElementById('scene-boccaccio');
const pz = Panzoom(elem, { 
    maxScale: 5, 
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
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", centroX);
    circle.setAttribute("cy", centroY);
    circle.setAttribute("r", "12"); // leggermente più grande per touch
    circle.setAttribute("class", "map-pin");
    circle.setAttribute("tabindex", "0");
    circle.setAttribute("aria-label", (mare.name_it || mare.name_lat || "Pin mappa"));
    // Tooltip custom
    circle.addEventListener('mouseenter', (e) => showTooltip(e, mare.name_it || mare.name_lat));
    circle.addEventListener('mouseleave', hideTooltip);
    circle.addEventListener('focus', (e) => showTooltip(e, mare.name_it || mare.name_lat));
    circle.addEventListener('blur', hideTooltip);
    // Click/tap
    circle.onclick = (e) => { e.stopPropagation(); renderDettagli(mare); focusPin(circle); };
    // Tastiera
    circle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            renderDettagli(mare);
            focusPin(circle);
        }
    });
    return circle;
}

function renderArea(mare) {
    const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    poly.setAttribute("points", mare.punti_svg);
    poly.setAttribute("class", "area-interna");
    poly.setAttribute("tabindex", "0");
    poly.setAttribute("aria-label", (mare.name_it || mare.name_lat || "Area mappa"));
    // Tooltip custom
    poly.addEventListener('mouseenter', (e) => showTooltip(e, mare.name_it || mare.name_lat));
    poly.addEventListener('mouseleave', hideTooltip);
    poly.addEventListener('focus', (e) => showTooltip(e, mare.name_it || mare.name_lat));
    poly.addEventListener('blur', hideTooltip);
    // Click/tap
    poly.onclick = (e) => { e.stopPropagation(); renderDettagli(mare); focusPin(poly); };
    // Tastiera
    poly.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            renderDettagli(mare);
            focusPin(poly);
        }
    });
    return poly;
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
        const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        poly.setAttribute("points", mare.punti_svg);
        poly.setAttribute("id", "area-evidenziata-temp");
        poly.setAttribute("style", "fill:rgba(241, 196, 15, 0.4); stroke:#f1c40f; stroke-width:3; pointer-events:none;");
        svg.appendChild(poly);
    }
    renderCitazioni(mare.lista_citazioni);
    renderSubMenu(mare);
    renderMappaModerna(mare);
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
    const figli = database.filter(m => String(m.parent_id) === String(mare.id));
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


// --- FUNZIONI DI INTERAZIONE (USANO SOLO LE FUNZIONI DI RENDERING) ---

async function caricaApp() {
    try {
        // Carichiamo i dati direttamente dalla Web App (che include già parent_id e citazioni)
        const response = await fetch(WEB_APP_URL);
        database = await response.json();
        renderMappa(database, livelloCorrente);
    } catch (e) {
        console.warn("Errore caricamento remote, tentando fallback locale:", e);
        try {
            const respLocal = await fetch('./assets/data.json');
            if (respLocal.ok) {
                database = await respLocal.json();
            } else {
                database = [];
            }
        } catch (e2) {
            console.error("Fallback locale non disponibile:", e2);
            database = [];
        }
        renderMappa(database, livelloCorrente);
    }
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
    renderMappa(database, livelloCorrente);
}

function tornaAlLivelloPrincipale() {
    livelloCorrente = "principale";
    pz.reset({ animate: true });
    document.getElementById('btn-back-map').style.display = "none";
    renderMappa(database, livelloCorrente);
}

function chiudiModale() {
    const modal = document.getElementById('info-modal');
    modal.style.display = 'none';
}

// Avvio app
caricaApp();