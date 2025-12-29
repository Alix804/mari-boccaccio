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

// Inizializza Mappa Moderna
let map = L.map('modern-map').setView([38.0, 15.0], 5);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 8
}).addTo(map);

async function caricaApp() {
    try {
        // Carichiamo i dati direttamente dalla Web App (che include già parent_id e citazioni)
        const response = await fetch(WEB_APP_URL);
        database = await response.json();
        
        disegnaMappa();
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
        disegnaMappa();
    }
}

function disegnaMappa() {
    const svg = document.getElementById('svg-boccaccio');
    svg.innerHTML = ""; 

    database.forEach(item => {
        // Determiniamo se l'elemento deve apparire in questo livello
        const isFiglio = item.parent_id && item.parent_id !== "";
        const deveApparire = (livelloCorrente === "principale") 
            ? !isFiglio 
            : String(item.parent_id) === String(livelloCorrente);

        if (deveApparire && item.punti_svg) {
            if (livelloCorrente === "principale") {
                disegnaPin(item);
            } else {
                disegnaArea(item);
            }
        }
    });
}

function disegnaPin(mare) {
    const svg = document.getElementById('svg-boccaccio');
    
    // 1. Trasformiamo la stringa dei punti in un array di numeri
    const punti = mare.punti_svg.split(" ").map(p => {
        const coords = p.split(",");
        return { x: parseInt(coords[0]), y: parseInt(coords[1]) };
    });

    // 2. Calcoliamo la media delle coordinate X e Y (Baricentro)
    const centroX = punti.reduce((sum, p) => sum + p.x, 0) / punti.length;
    const centroY = punti.reduce((sum, p) => sum + p.y, 0) / punti.length;
    
    // 3. Creiamo il Pin al centro esatto
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", centroX);
    circle.setAttribute("cy", centroY);
    circle.setAttribute("r", "10"); // Un po' più grande per visibilità
    circle.setAttribute("class", "map-pin");
    
    // Titolo a comparsa al passaggio del mouse (nativa del browser)
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = mare.name_it || mare.name_lat;
    circle.appendChild(title);

    circle.onclick = (e) => { 
        e.stopPropagation(); 
        mostraDettagli(mare); 
    };
    
    svg.appendChild(circle);
}

function disegnaArea(mare) {
    const svg = document.getElementById('svg-boccaccio');
    const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    poly.setAttribute("points", mare.punti_svg);
    poly.setAttribute("class", "area-interna");
    poly.onclick = (e) => { e.stopPropagation(); mostraDettagli(mare); };
    svg.appendChild(poly);
}

function mostraDettagli(mare) {
    // Assicuriamoci che la modale sia visibile quando mostriamo i dettagli
    const modal = document.getElementById('info-modal');
    modal.style.display = 'block';
    document.getElementById('m-nome').innerText = mare.name_it || "Ignoto";
    document.getElementById('m-lat').innerText = mare.name_lat || "-";
    document.getElementById('m-mod').innerText = mare.denominazione_moderna || "-";
    // Mostra la tipologia se presente
    document.getElementById('m-info-extra').innerText = mare.tipologia ? ('Tipologia: ' + mare.tipologia) : '';
    const vecchiaArea = document.getElementById('area-evidenziata-temp');
    if (vecchiaArea) vecchiaArea.remove();

    if (mare.punti_svg) {
        const svg = document.getElementById('svg-boccaccio');
        const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        poly.setAttribute("points", mare.punti_svg);
        poly.setAttribute("id", "area-evidenziata-temp");
        poly.setAttribute("style", "fill:rgba(241, 196, 15, 0.4); stroke:#f1c40f; stroke-width:3; pointer-events:none;");
        svg.appendChild(poly);
    }
    const container = document.getElementById('citazioni-container');
    const subMenu = document.getElementById('sub-menu-container');
    container.innerHTML = "";
    subMenu.innerHTML = "";

    // Mostra citazioni (descrizione visibile solo al click sul titolo)
    if (mare.lista_citazioni && mare.lista_citazioni.length > 0) {
        mare.lista_citazioni.forEach(cit => {
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

    // Controlla se ha sottomari per mostrare il tasto Zoom
const figli = database.filter(m => String(m.parent_id) === String(mare.id));
    if (figli.length > 0) {
        const btn = document.createElement('button');
        btn.innerHTML = "🔍 Esplora Mari Interni (" + figli.length + ")";
        btn.className = "btn-esplora"; // Aggiungi una classe per lo stile
        btn.onclick = () => entraNelMare(mare);
        subMenu.appendChild(btn);
    }

    // Mappa Moderna
if (mare.corrispondenza_moderna) {
        const [lat, lng] = mare.corrispondenza_moderna.split(",").map(n => parseFloat(n.trim()));
        if (markerAttivo) map.removeLayer(markerAttivo);
        markerAttivo = L.marker([lat, lng]).addTo(map);
        map.flyTo([lat, lng], 6);
    }
}

function entraNelMare(mare) {
    livelloCorrente = mare.id;
    
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

    const scalaZoom = 2.5; // Leggermente meno aggressivo per non perdere l'orientamento

    // Rimuoviamo l'evidenziazione gialla prima di ridisegnare i sottomari
    const temp = document.getElementById('area-evidenziata-temp');
    if (temp) temp.remove();

    // PANZOOM: Usiamo smooth: true per togliere lo scatto
    pz.zoom(scalaZoom, { animate: true });
    
    // Il calcolo corretto per centrare:
    // Dobbiamo spostare l'origine in base alla metà della dimensione dell'SVG (500)
    // moltiplicato per lo zoom.
    setTimeout(() => {
        pz.pan(
            (500 - centroX) * scalaZoom, 
            (500 - centroY) * scalaZoom, 
            { animate: true }
        );
    }, 150); // Delay aumentato per dare tempo al browser di "capire" la nuova scala

    document.getElementById('btn-back-map').style.display = "block";
    disegnaMappa();
}

function tornaAlLivelloPrincipale() {
    livelloCorrente = "principale";
    pz.reset({ animate: true });
    document.getElementById('btn-back-map').style.display = "none";
    disegnaMappa();
}

function chiudiModale() {
    const modal = document.getElementById('info-modal');
    modal.style.display = 'none';
}

caricaApp();