if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Usunięcie kropki sprawia, że ścieżka jest relatywna do lokalizacji index.html
        navigator.serviceWorker.register('sw.js') 
            .then(reg => {
                // Dodaj powiadomienie o aktualizacji (opcjonalnie)
                reg.onupdatefound = () => {
                    console.log('Znaleziono nową wersję grafika! Odśwież, aby zaktualizować.');
                };
            })
            .catch(err => console.error('Błąd SW:', err));
    });
}
const LOCALSTORAGE_KEY = 'randr-session';
const SESSION_TIMEOUT = 86400; //(sek.)

const machineDB = {
	"M001": {
		nazwa: "RETURN SPRING SNR ASSY",
		nr: "A2-SUB-0020",
		sondy: {
			"LF": { nazwa_cechy: "SWASH PLATE THICKNESS", zero: { rf: 0.02, graduation: 0.0001, master: 0 }, span: { rf: 0.02, graduation: 0.0001, master: 1.6 } },
			"RF": { nazwa_cechy: "SWASH PLATE THICKNESS", zero: { rf: 0.02, graduation: 0.0001, master: 0 }, span: { rf: 0.02, graduation: 0.0001, master: 1.6 } },
			"LB": { nazwa_cechy: "SWASH PLATE THICKNESS", zero: { rf: 0.02, graduation: 0.0001, master: 0 }, span: { rf: 0.02, graduation: 0.0001, master: 1.6 } },
			"RB": { nazwa_cechy: "SWASH PLATE THICKNESS", zero: { rf: 0.02, graduation: 0.0001, master: 0 }, span: { rf: 0.02, graduation: 0.0001, master: 1.6 } },
			"SNR": { nazwa_cechy: "SNR HEIGHT", zero: { rf: 0.6, graduation: 0.001, master: 0 }, span: { rf: 0.6, graduation: 0.001, master: 2.0 } },
			"Pin A": { nazwa_cechy: "PIN HEIGHT A", zero: { rf: 0.2, graduation: 0.001, master: 0 }, span: { rf: 0.2, graduation: 0.001, master: 1.5 } },
			"Pin B": { nazwa_cechy: "PIN HEIGHT B", zero: { rf: 0.2, graduation: 0.001, master: 0 }, span: { rf: 0.2, graduation: 0.001, master: 1.5 } }
		},
	}
};

const prepareMachineDBIndex = (data) => {
	return Object.entries(data).map(([id, info]) => {
		const probesTags = [...new Set(
			Object.values(info.sondy).map(s => s.nazwa_cechy)
		)].join(' ');
		
		return {id: id, tags: `${id} ${info.nazwa} ${info.nr} ${probesTags}`.toLowerCase()};
	});
}
	
const indexedMachineDB = prepareMachineDBIndex(machineDB);
let machineSelectBtns = null; // wypełnimy to w init()

const debounce = (func, ms) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), ms);
  };
};

const handleMachineSearch = (e) => {
    const text = e.target.value.toLowerCase().trim();

    if (text.length < 1) {
        filterMachineSearchResults(Object.keys(machineDB)); 
        return; 
    }
	console.log('tutaj');
    const results = indexedMachineDB
        .filter(item => item.tags.includes(text))
        .map(item => item.id);

    filterMachineSearchResults(results);
};

document.getElementById('machine-select-input').addEventListener (
    'input', 
    debounce(handleMachineSearch, 300)
);

document.getElementById('machine-buttons-container').onclick = (e) => {
	const btn = e.target.closest('.sonda-btn');
	if(btn) {
		handleMachineSelect(btn.dataset.machineId);
	}
}

document.getElementById('probe-buttons-container').onclick = (e) => {
    const btn = e.target.closest('.sonda-btn');
    if(btn) {
        // Pobieramy dane z 'btn' (przycisku), a nie z 'e.target' (celu kliknięcia)
        const machine = btn.dataset.machineId; 
        const probe = btn.dataset.probeId;
        
        if (machine && probe && machineDB[machine]) {
            session.probeID = probe;
            // Przypisanie nazwy cechy do sesji
            session.probeName = machineDB[machine].sondy[probe].nazwa_cechy;
            changeScreen('master-select-screen');
        } else {
            console.error("Błąd: Nie znaleziono danych maszyny lub sondy", {machine, probe});
        }
    }
};
	
let session = {
	date: null,
	machineID: null,
	machineNr: null,
	machineName: null,
	probeID: null, 
	probeName: null,
	masterType: null,
	masterParams: null, 
	testLength: 0, 
	grad: 0, 
	measurements: [], 
	idealMeasurements: [],
	currentScreen: 'machine-select-screen' // Domyślny ekran startowy
};

function init() {
	initKeypad();
	renderMachineButtons();

	const savedData = localStorage.getItem(LOCALSTORAGE_KEY);
	if (!savedData) {
		changeScreen('machine-select-screen');
		return;
	}

	try {
		const parsed = JSON.parse(savedData);
		const sessionDate = new Date(parsed?.date || 0).getTime();
		const now = Date.now();
		const isExpired = (now - sessionDate) > (1000 * SESSION_TIMEOUT);

		// SCENARIUSZ: Sesja jest świeża - wznawiamy bez zbędnych pytań
		if (!isExpired) {
			Object.assign(session, parsed);
			changeScreen(session.currentScreen || 'machine-select-screen');
			return;
		}

		// SCENARIUSZ: Sesja wygasła, ale jest pusta - czyścimy i startujemy od nowa
		const measurements = parsed?.measurements || [];
		if (measurements.length === 0) {
			clearStoredSession();
			return;
		}

		// SCENARIUSZ: Sesja wygasła, ale zawiera dane (kompletne lub nie)
		handleExpiredSessionWithData(parsed);

	} catch (e) {
		console.error("Błąd krytyczny przy inicjalizacji sesji:", e);
		clearStoredSession();
	}
}

function clearStoredSession() {
    localStorage.removeItem(LOCALSTORAGE_KEY);
    resetSessionObject();
    changeScreen('machine-select-screen');
}

function handleExpiredSessionWithData(parsedData) {
    Object.assign(session, parsedData);
    
    const count = session.measurements.length;
    const total = session.testLength;
    const isComplete = count >= total;

    const descEl = document.getElementById('expired-desc');
    const saveBtn = document.getElementById('btn-save-expired');

    // Bezpieczne czyszczenie i budowanie komunikatu bez innerHTML
    descEl.textContent = ''; 
    
    if (isComplete) {
        descEl.append(
            `Znaleziono `, 
            createStrong("ukończony"), 
            ` raport sprzed godziny (${count} pomiarów).`,
            document.createElement('br'),
            `Możesz go zapisać przed usunięciem.`
        );
    } else {
        descEl.append(
            `Twoja sesja sprzed godziny była `,
            createStrong("niekompletna"),
            ` (${count}/${total} pomiarów) i została wygaszona.`
        );
    }

    // Profesjonalne zarządzanie widocznością przez klasę CSS (np. .hidden { display: none; })
    saveBtn.classList.toggle('hidden', !isComplete);
    
    changeScreen('session-expired-screen');
}

function createStrong(text) {
    const el = document.createElement('strong');
    el.textContent = text;
    return el;
}

function handleExpiredDownload() {
    // Wykorzystujemy Twoją istniejącą funkcję do raportu
    raportPage(); // Zakładam, że tak się nazywa funkcja pobierania
}

function handleStartNewAfterExpired() {
    localStorage.removeItem(LOCALSTORAGE_KEY);
    resetSessionObject();
    changeScreen('machine-select-screen');
}

function resetSessionObject() {
    // 1. Reset podstawowych informacji o procesie
    session.date = null;
    session.currentScreen = 'machine-select-screen';
    
    // 2. Reset identyfikatorów sprzętowych
    session.machineID = null;
    session.machineNr = null;
    session.machineName = null;
    session.probeID = null;
    session.probeName = null;
    
    // 3. Reset parametrów technicznych i tolerancji
    session.masterType = null;
    session.masterParams = {
        master: 0,
        tolPlus: 0,
        tolMinus: 0,
        rf: 0,
        graduation: 0.001
    };
    
    // 4. Resetowanie danych pomiarowych
    session.measurements = [];
    session.testLength = 0;
    session.grad = 3; // Domyślna dokładność wyświetlania
    session.idealMeasurements = null;

    console.log("Obiekt sesji został zresetowany do wartości domyślnych.");
}

function renderMachineButtons() {
    const container = document.getElementById('machine-buttons-container');
    
    // POPRAWKA: Usuwanie wszystkich dzieci poza tym jednym konkretnym
    // Iterujemy od końca, aby zmiana indeksów nie psuła pętli
    const children = Array.from(container.children);
    children.forEach(child => {
        if (child.id !== 'machine-select-empty-result') {
            child.remove(); // Szybsze i nowocześniejsze niż removeChild
        }
    });

    const fragment = document.createDocumentFragment();
    for (let id in machineDB) {
        const machineData = machineDB[id];
        const btn = document.createElement('button');
        // Dodaję machine-btn, żeby pasowało do Twojej wcześniejszej logiki filtrowania
        btn.className = 'btn btn-outline sonda-btn machine-btn'; 
        btn.dataset.machineId = id;
        
        const spanId = document.createElement('span');
        spanId.className = 'sonda-id';
        spanId.textContent = machineData.nr;
        
        const spanDesc = document.createElement('span');
        spanDesc.className = 'sonda-desc';
        spanDesc.textContent = machineData.nazwa;
        
        btn.append(spanId, spanDesc);
        fragment.append(btn);
    }
    
    container.append(fragment);
}
		
function filterMachineSearchResults(keysToRender) {
    // Zamieniamy wszystkie otrzymane klucze na małe litery raz przed pętlą
    const lowerKeys = keysToRender.map(k => k.toLowerCase());
    
    document.querySelectorAll('#machine-buttons-container > button').forEach(btn => {
        // Pobieramy ID z przycisku i też zamieniamy na małe litery
        const btnId = (btn.dataset.machineId || "").toLowerCase();
        
        const isVisible = lowerKeys.includes(btnId);
        btn.classList.toggle('hidden', !isVisible);
    });
    
    document.getElementById('machine-select-empty-result').classList.toggle('hidden', keysToRender.length > 0);
}		
	 	
function initKeypad() {
	const kp = document.getElementById('keypad');
	const fragment = document.createDocumentFragment();
	kp.textContent = ''; 
	
	const keys = ['1','2','3','4','5','6','7','8','9','-','0','.'];

	keys.forEach(k => {
		const b = document.createElement('button');
		b.type = 'button';
		b.className = 'btn btn-outline key-btn'; 
		b.textContent = k;
		b.onclick = () => handleInput(k);
		fragment.appendChild(b);
	});

	// Przycisk C
	const cBtn = document.createElement('button');
	cBtn.type = 'button';
	cBtn.className = 'btn key-btn key-clear';
	cBtn.textContent = 'C';
	cBtn.onclick = () => handleInput('C');

	// Przycisk ENTER
	const ent = document.createElement('button');
	ent.type = 'button';
	ent.className = 'btn btn-primary key-btn key-enter';
	ent.textContent = 'DODAJ POMIAR';
	ent.onclick = () => handleInput('ENTER');
	
	fragment.append(cBtn, ent);
	
	kp.append(fragment);
}
	
function saveSession() {
    session.date = Date.now(); // Używamy nowocześniejszego Date.now()
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(session));
}

function handleInput(value) {
	document.activeElement.blur();
    const disp = document.getElementById('input-field');
    const val = value.toUpperCase(); // Lepiej operować na dużych, skoro w kodzie masz 'C' i 'ENTER'

    // Obsługa usuwania znaku
    if (val === 'C') {
        disp.value = disp.value.slice(0, -1);
        return;
    }

    // Obsługa zatwierdzania pomiaru
    if (val === 'ENTER') {
        const rawValue = disp.value.replace(',', '.');
        const v = parseFloat(rawValue);

        // Ulepszony Regex: musi być przynajmniej jedna cyfra
        const isValidNumber = /^-?\d+(\.\d*)?$/.test(rawValue) || /^-?\.\d+$/.test(rawValue);

        if (!isNaN(v) && isValidNumber) {
            session.measurements.push(v);
            
            // Logika idealMeasurements (do 50 pomiarów)
            if (session.measurements.length <= 50) {
                session.idealMeasurements[session.measurements.length - 1] = v;
            }

            saveSession(); // Zapisujemy
            
            disp.value = '';
            updateStats();
        }
        return;
    }

    // Obsługa minusa (Toggle)
    if (val === '-') {
        disp.value = disp.value.startsWith('-') ? disp.value.slice(1) : '-' + disp.value;
        return;
    }

    // Blokada wielokrotnej kropki
    if (val === '.' && disp.value.includes('.')) return;

    // Limit znaków (np. 10) - ochrona przed "puchnięciem" interfejsu
    if (disp.value.length < 10) {
        disp.value += value; // Tutaj używamy oryginalnego 'value' (mała/duża litera bez znaczenia dla cyfr)
    }
}

function undoLast() {
    if (session.measurements.length === 0) return;

    session.measurements.pop();
    const newLength = session.measurements.length;
    
    // Przywracamy wartość wzorca w tablicy idealnej
    if (session.idealMeasurements[newLength] !== undefined) {
        session.idealMeasurements[newLength] = session.masterParams.master;
    }

    saveSession(); // Korzystamy z nowej funkcji pomocniczej
    updateStats();
}  

function resetAppToStart(noScreenName = 'measurement-screen') {
// Zamiast confirm() można w przyszłości wstawić ładny modal HTML
	askUser("Sesja pomiarowa nadal trwa...", "Czy na pewno chcesz przerwać i usunąć wszystkie dane obecnej sesji?",
		() => {
		
		// 1. Czyszczenie magazynu trwałego
		localStorage.removeItem(LOCALSTORAGE_KEY);
		
		resetSessionObject();
		
		// 3. Reset wizualny pól input i nagłówków
		document.getElementById('input-field').value = '';
		document.getElementById('history-log').textContent = '';
		document.getElementById('val-avg').textContent = "--";
		document.getElementById('val-cg').textContent = "--";
		document.getElementById('val-cgk').textContent = "--";
		document.getElementById('counter').textContent = "0/--";
		
		// 4. Powrót do startu bez przeładowania (Smooth SPA transition)
		changeScreen('machine-select-screen');
		
		console.log("Aplikacja zresetowana pomyślnie.");
	},
	() => {
		changeScreen(noScreenName);
	},
	true);
}

function handleMachineSelect(id) {
	if (!id) return;
		
	session.machineID = id;
	session.machineName = machineDB[id].nazwa;
	session.machineNr = machineDB[id].nr;
	document.getElementById('current-machine-label').textContent = session.machineNr;
	renderProbeButtons(id);
	changeScreen('probe-select-screen');
}
   
function renderProbeButtons(machineId) {
	const container = document.getElementById('probe-buttons-container');
	container.textContent = '';
	const fragment = document.createDocumentFragment();
	const probes = machineDB[machineId].sondy;
	
	for (let probeId in probes) {
		const btn = document.createElement('button');
		btn.className = 'btn btn-outline sonda-btn';
		
		const sondaId = document.createElement('span');
		sondaId.className = 'sonda-id';
		sondaId.textContent = probeId;
		btn.dataset.probeId = probeId;
		btn.dataset.machineId = machineId;
		
		const sondaDesc = document.createElement('span');
		sondaDesc.className = 'sonda-desc';
		sondaDesc.textContent = probes[probeId].nazwa_cechy;
		
		btn.append(sondaId, sondaDesc);
		fragment.append(btn);
	}
	
	container.append(fragment);
}

function handleMasterSelect(type) {
	session.masterType = type;
	session.masterParams = machineDB[session.machineID].sondy[session.probeID][type];
	session.grad = getPrecision(session.masterParams.graduation);
	
	const m = session.masterParams.master;
	const rf = session.masterParams.rf;
	const g = session.masterParams.graduation;

	document.getElementById('measurement-title').textContent = `Pomiar Sonda: ${session.probeID}`;
	changeScreen('test-length-screen');
}

function handleTestLengthChoice(testLength) {
	session.testLength = testLength;
	prepareMeasurements();
	updateStats();
	changeScreen('measurement-screen');
}	
    
function calculateStats(data, nominal, tolerance) {
	const n = data.length;
	if (n < 2) return null;

	const avg = data.reduce((a, b) => a + b, 0) / n;
	const variance = data.map(x => Math.pow(x - avg, 2)).reduce((a, b) => a + b, 0) / (n - 1);
	const std = Math.sqrt(variance);

	const epsilon = session.masterParams.graduation / 10
	if (std < epsilon ) return { avg, cg: -9.99, cgk: -9.99, std: 0 };

	const cg = (0.2 * tolerance) / (4 * std);
	const cgk = (0.1 * tolerance - Math.abs(nominal - avg)) / (2 * std);

	return { avg, cg, cgk, std };
}

function getPrecision(graduation){
	if (graduation >= 1) return 0;
	const grad = graduation.toString().split('.');
	return grad.length > 1? grad[1].length: 0;
}

function prepareMeasurements() {
	if (session.masterParams) {
		session.measurements = [];
		session.idealMeasurements = new Array(session.testLength).fill(session.masterParams.master);
		
	}
}
		
function updateStats() {
	const { measurements, idealMeasurements, masterParams, testLength, machineID, probeID } = session;
	const n = measurements.length;
	const m = masterParams.master;
	const t = masterParams.rf;
	const f = session.grad; // precyzja wyświetlania

	// 1. Aktualizacja tekstowa (Szybka i bezpieczna)
	document.getElementById('active-station-name').textContent = `${machineID} | ${probeID}`;
	document.getElementById('counter').textContent = `${n} / ${testLength}`;

	// 2. Historia pomiarów (Zamiast innerHTML w pętli - budujemy jeden fragment)
	renderHistoryLog(measurements, m, t, f);

	// 3. Obliczenia i Pigułki
	const stats = calculateStats(measurements, m, t);
	const ideal = calculateStats(idealMeasurements, m, t);

	updateMeasurementUI(stats,ideal, f);

	// 4. Sterowanie interfejsem (Używamy klas, nie styli inline)
	const isFinished = n >= session.testLength;
	document.getElementById('input-container').classList.toggle('hidden', isFinished);
	document.getElementById('keypad').classList.toggle('hidden', isFinished);
	document.getElementById('btn-final').classList.toggle('hidden', !isFinished);

	if (typeof drawChart === 'function') drawChart(session.testLength);
}

function renderHistoryLog(measurements, master, tolerance, precision) {
    const log = document.getElementById('history-log');
    const currentCount = log.children.length;
    const targetCount = measurements.length;

    // Brak zmian w ilości pomiarów – nie przerenderowujemy
    if (currentCount === targetCount) return;

    // Reset do zera (np. nowa sesja)
    if (targetCount === 0) {
        log.textContent = '';
        return;
    }

    // Dodano nowe pomiary (najczęściej 1 po wciśnięciu ENTER)
    if (targetCount > currentCount) {
        // Wycinamy tylko te pomiary, których jeszcze nie ma w DOM
        const newMeasurements = measurements.slice(currentCount);
        const fragment = document.createDocumentFragment();
        
        let counter = 1;
        newMeasurements.forEach(v => {
            const diff = Math.abs(v - master);
            const item = document.createElement('div');
            item.className = 'history-item';
            item.textContent = `${counter}: ${v.toFixed(precision)}`;
            counter++;

            if (diff > tolerance / 2) item.classList.add('text-danger');
            else if (diff > (tolerance * 0.1)) item.classList.add('text-warning');
            else item.classList.add('text-success');

            // Dodajemy element na początek fragmentu
            fragment.prepend(item);
        });
        
        // Wrzucamy fragment na sam początek logu historii
        log.prepend(fragment);
    } 
    // Cofnięto pomiar (użycie funkcji undoLast)
    else {
        const diff = currentCount - targetCount;
        for (let i = 0; i < diff; i++) {
            if (log.firstElementChild) {
                log.firstElementChild.remove();
            }
        }
    }
}

function updateMeasurementUI(stats, ideal, precision = 3) {
    // 1. Mapowanie elementów (zapobiega wielokrotnemu szukaniu w DOM)
    const elements = {
        cg: document.getElementById('val-cg'),
        maxCg: document.getElementById('val-max-cg'),
        cgk: document.getElementById('val-cgk'),
        maxCgk: document.getElementById('val-max-cgk'),
        avg: document.getElementById('val-avg'),
        bias: document.getElementById('val-bias'),
        indCg: document.getElementById('ind-cg'),
        indCgk: document.getElementById('ind-cgk')
    };

    // Helper do formatowania: obsługa null (jako nieskończoność) i undefined
    const fmt = (val, p) => {
        if (val === null) return "∞";
        if (typeof val !== 'number') return "--";
        return val.toFixed(p);
    };

    // 2. Obsługa braku danych (reset interfejsu)
    if (!stats) {
        Object.values(elements).forEach(el => {
            if (el && el.tagName === 'SPAN') el.textContent = "--";
            if (el && el.classList.contains('indicator')) {
                el.classList.remove('status-pass', 'status-fail');
            }
        });
        return;
    }

    // 3. Aktualizacja wartości tekstowych
    elements.cg.textContent = fmt(stats.cg, 2);
    elements.maxCg.textContent = fmt(ideal?.cg, 2);
    
    elements.cgk.textContent = fmt(stats.cgk, 2);
    elements.maxCgk.textContent = fmt(ideal?.cgk, 2);
    
    elements.avg.textContent = fmt(stats.avg, precision);
    
    // Obliczenie i formatowanie Bias
    const biasVal = stats.avg - session.masterParams.master;
    elements.bias.textContent = fmt(biasVal, precision);

    // 4. Logika kolorowania wskaźników statusu (lewa krawędź)
    if (stats.cg !== null) {
        elements.indCg.classList.toggle('status-pass', stats.cg >= 1.33);
        elements.indCg.classList.toggle('status-fail', stats.cg < 1.33);
    }
    
    if (stats.cgk !== null) {
        elements.indCgk.classList.toggle('status-pass', stats.cgk >= 1.33);
        elements.indCgk.classList.toggle('status-fail', stats.cgk < 1.33);
    }

    // 5. Specyficzne kolorowanie tekstu BIAS (opcjonalne, zależne od tolerancji)
    const tol = session.masterParams.rf * 0.1;
    const absBias = Math.abs(biasVal);
    
    elements.bias.classList.toggle('text-success', absBias < tol);
    elements.bias.classList.toggle('text-warning', absBias >= tol && absBias < tol * 2);
    elements.bias.classList.toggle('text-danger', absBias >= tol * 2);
}
	
function getChartTheme() {
    const s = getComputedStyle(document.documentElement);
    return {
        warningZone: s.getPropertyValue('--chart-warning-zone').trim(),
        successZone: s.getPropertyValue('--chart-success-zone').trim(),
        lineError:   s.getPropertyValue('--chart-line-error').trim(),
        lineSuccess: s.getPropertyValue('--chart-line-success').trim(),
        linePath:    s.getPropertyValue('--chart-line-path').trim(),
        pointNormal: s.getPropertyValue('--chart-point-normal').trim(),
        pointWarn:   s.getPropertyValue('--chart-point-warning').trim(),
        pointError:  s.getPropertyValue('--chart-point-error').trim(),
        textMuted:   s.getPropertyValue('--chart-text').trim(),
        pointBorder: s.getPropertyValue('--chart-point-border').trim()
    };
}

function drawChart(maxChartSteps = 50, canvasId = 'chart_canva') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    //ctx.globalAlpha = 0.6;
    const theme = getChartTheme();
    
    // Optymalizacja: ustawiamy wymiary tylko gdy faktycznie się zmieniły
    const rectW = canvas.offsetWidth;
    const rectH = canvas.offsetHeight;
    if (canvas.width !== rectW || canvas.height !== rectH) {
        canvas.width = rectW;
        canvas.height = rectH;
    }
    
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    
    const m = session.masterParams.master;
    const t = session.masterParams.rf;
    const measurements = session.measurements || [];
    
    // Obliczanie skali (wyciągnięte przed pętle)
    const points = measurements.length > 0 ? measurements : [m];
    const minVal = Math.min(...points, m - t * 0.5);
    const maxVal = Math.max(...points, m + t * 0.5);
    const rangeY = (maxVal - minVal) || 0.01;
    const padding = h * 0.1; // 10% marginesu góra/dół
    const chartHeight = h - (padding * 2);

    // Funkcja skali (zoptymalizowana - mniej dzieleń w pętli)
    const yScale = (val) => Math.round(h - padding - ((val - minVal) / rangeY) * chartHeight);
    const xStep = (w - 20) / maxChartSteps; 
    const greenZoneT = t * 0.1;

    // --- 1. STREFY TŁA (Zgrupowane wypełnienia) ---
   const yMaxT = yScale(m + t/2);
    const yMinT = yScale(m - t/2);
    const yMaster = yScale(m);

    ctx.fillStyle = theme.warningZone;
    ctx.fillRect(0, yMaxT, w, yMinT - yMaxT);

    const yGreenHigh = yScale(m + greenZoneT);
    const yGreenLow = yScale(m - greenZoneT);
    ctx.fillStyle = theme.successZone;
    ctx.fillRect(0, yGreenHigh, w, yGreenLow - yGreenHigh);

    // --- 2. LINIE REFERENCYJNE ---
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = theme.lineError;
    ctx.beginPath(); 
    ctx.moveTo(0, yMaxT); ctx.lineTo(w, yMaxT); 
    ctx.moveTo(0, yMinT); ctx.lineTo(w, yMinT); 
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.strokeStyle = theme.lineSuccess;
    ctx.beginPath(); 
    ctx.moveTo(0, yMaster); ctx.lineTo(w, yMaster); 
    ctx.stroke();

    if (measurements.length === 0) return;

    // Przygotowanie punktów (pre-calculating)
    const coords = measurements.map((v, i) => ({
        x: Math.round(i * xStep + 10),
        y: yScale(v),
        diff: Math.abs(v - m)
    }));

    // --- 3. LINIA ŁĄCZĄCA ---
    if (coords.length > 1) {
        ctx.strokeStyle = theme.linePath;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        coords.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
    }

    // --- 4. PUNKTY (Zoptymalizowane rysowanie) ---
    ctx.lineWidth = 1;
    ctx.strokeStyle = theme.pointBorder;
    coords.forEach(p => {
        if (p.diff > t/2) ctx.fillStyle = theme.pointError;      
        else if (p.diff > greenZoneT) ctx.fillStyle = theme.pointWarn; 
        else ctx.fillStyle = theme.pointNormal;                 

        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, 6.28); // 6.28 zamiast Math.PI * 2 (mikro-optymalizacja)
        ctx.fill();
        ctx.stroke();
    });

    // --- 5. ETYKIETY (Na końcu, by były na wierzchu) ---
    ctx.font = "10px monospace"; // Nieco większa dla lepszej czytelności na ekranie terminala
    ctx.textAlign = "right";
    ctx.fillStyle = theme.textMuted;
    const f = session.grad; // Używamy precyzji z sesji

    ctx.fillText((m + t/2).toFixed(f), w - 5, yMaxT - 5);
    ctx.fillText((m - t/2).toFixed(f), w - 5, yMinT + 12);
    ctx.fillStyle = theme.lineSuccess;
    ctx.fillText(`M: ${m.toFixed(f)}`, w - 5, yMaster - 5);
}

function changeScreen(screenId) {
    session.currentScreen = screenId;
    
    // Zapamiętaj gdzie jesteś
    if (session.measurements.length === 0) {
        session.date = new Date().getTime();
    }
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(session));

    // Definiujemy logikę zmiany DOM w osobnej funkcji
    const updateDOM = () => {
        // Przełączanie widoczności
        document.querySelectorAll('main > section').forEach(section => {
            section.classList.toggle('active', section.id === screenId);
        });

        // Specyficzne akcje dla ekranów
        if (screenId === 'measurement-screen') {
            updateStats();
        }
        if (screenId === 'machine-select-screen') {
            renderMachineButtons();
        }
        if (screenId === 'probe-select-screen') {
            renderProbeButtons(session.machineID);
        }
    };

    // Obsługa View Transitions API
    if (document.startViewTransition) {
        // Natywne płynne przejście
        document.startViewTransition(() => updateDOM());
    } else {
        // Fallback dla starszych przeglądarek
        updateDOM();
    }
}

const ChartEngine = {
    NS: "http://www.w3.org/2000/svg",
    CONFIG: {
        width: 800, height: 400,
        padding: { top: 50, right: 80, bottom: 40, left: 60 }, // Lewy margines pozwala na etykiety siatki
        pointRadius: 4
    },

    generateTrendChart: function(data, master, rf, precision = 3, title='') {
        const { width, height, padding } = this.CONFIG;
        const svg = document.createElementNS(this.NS, "svg");
        svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        svg.style.fontFamily = "monospace"; 

        if (!data || data.length === 0) {
            const text = this._createText("50%", "50%", "Brak danych", "#666");
            text.setAttribute("text-anchor", "middle");
            svg.appendChild(text);
            return svg;
        }
        
		const formatter = new Intl.DateTimeFormat('pl-PL', {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hour12: false // format 24h
		});

		// Wynik: "22.03.2026, 13:57" - format polski
		// Można go łatwo "posprzątać" zamieniając kropki na myślniki
		const formatted = formatter.format(session.date).replace(',', '');

		const t = rf;
        const limits = { upper: master + (t / 2), lower: master - (t / 2) };
        const greenZoneT = t * 0.1;
        const greenLimits = { upper: master + greenZoneT, lower: master - greenZoneT };

        const { min, max } = this._calculateScale(data, limits);
        
        const getX = (i) => padding.left + (i / (data.length > 1 ? data.length - 1 : 1)) * (width - padding.left - padding.right);
        const getY = (val) => height - padding.bottom - ((val - min) / (max - min)) * (height - padding.top - padding.bottom);
        
        //-- Tytuł ---
        svg.appendChild(this._createText(padding.left, Math.round(padding.top / 2) - 10, "Wykres trendu", "#666", 0, "16px"));
        
        // -- Podtyuł ---
        svg.appendChild(this._createText(padding.left, Math.round(padding.top / 2) + 10, `${session.machineNr} | ${session.probeID} | ${session.masterType} | ${formatted}`, "#666", 0, "11px"));

        // --- 1. STREFY TŁA ---
        svg.appendChild(this._createRect(
			padding.left, padding.top, width - padding.right - padding.left, height - padding.bottom - padding.top,
			"rgba(255,10,0,0.1)"
			)
		)
        
        svg.appendChild(this._createRect(
            padding.left, getY(limits.upper), 
            width - padding.left - padding.right, getY(limits.lower) - getY(limits.upper), 
            "rgba(255, 255, 0, 0.3)"
        ));

        svg.appendChild(this._createRect(
            padding.left, getY(greenLimits.upper), 
            width - padding.left - padding.right, getY(greenLimits.lower) - getY(greenLimits.upper), 
            "rgba(34, 197, 94, 0.5)"
        ));
        
        // --- 1.5 SIATKA (GRID) ---
        // Linie pionowe (pod każdym punktem)
        data.forEach((_, i) => {
            const x = getX(i);
            svg.appendChild(this._createLine(x, padding.top, x, height - padding.bottom, "#d1d5db", "1"));
        });

        // Linie poziome (np. 5 równych podziałów)
        const gridSteps = 8;
        for (let i = 0; i <= gridSteps; i++) {
            // Obliczamy wartość i jej pozycję Y
            const val = max - (i / gridSteps) * (max - min);
            const y = getY(val);
            
            //if( i === gridSteps - 1) continue;
            
            // Rysujemy szarą linię pomocniczą
            svg.appendChild(this._createLine(padding.left, y, width - padding.right, y, "#d1d5db", "1"));
            
            // Dodajemy etykiety osi Y po lewej stronie
            const labelText = this._createText(padding.left - 10, y + 4, val.toFixed(precision), "#6b7280");
            labelText.setAttribute("text-anchor", "end"); // Wyrównanie do prawej krawędzi tekstu
            svg.appendChild(labelText);
        }

        // --- 2. LINIE REFERENCYJNE ---
        svg.appendChild(this._createLine(padding.left, getY(limits.upper), width - padding.right + 10, getY(limits.upper), "#ef4444", "1", "5,5"));
        svg.appendChild(this._createLine(padding.left, getY(limits.lower), width - padding.right + 10, getY(limits.lower), "#ef4444", "1", "5,5"));
        svg.appendChild(this._createLine(padding.left, getY(master), width - padding.right + 10, getY(master), "#22c55e", "1.5"));

        // --- 3. LINIA ŁĄCZĄCA PUNKTY ---
        if (data.length > 1) {
            const pathD = data.map((val, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(val)}`).join(" ");
            const path = document.createElementNS(this.NS, "path");
            path.setAttribute("d", pathD);
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", "rgba(56, 189, 248, 0.7)");
            path.setAttribute("stroke-width", "1.5");
            svg.appendChild(path);
        }

        // --- 4. PUNKTY ---
        const pointChartLabelY = height - padding.bottom + 20;
        let pointCounter = 1;
        const isEven = (x) => x % 2 === 0;
        
        data.forEach((val, i) => {
            const diff = Math.abs(val - master);
            let color = "#ffffff"; 
            if (diff > t / 2) color = "#ef4444"; 
            else if (diff > greenZoneT) color = "#eab308"; 

            const circle = this._createCircle(getX(i), getY(val), this.CONFIG.pointRadius, color);
            circle.setAttribute("stroke", "#000"); 
            svg.appendChild(circle);
            
            if (isEven(pointCounter)){
				svg.appendChild(this._createText(getX(i), pointChartLabelY, `${pointCounter}`, "#666", -45, "10px"));
			}
            pointCounter++;
        });

        // --- 5. ETYKIETY WARTOŚCI GŁÓWNYCH ---
        const labelX = width - padding.right + 15;
        svg.appendChild(this._createText(labelX, getY(limits.upper) + 4, `T+: ${limits.upper.toFixed(precision)}`, "#666"));
        svg.appendChild(this._createText(labelX, getY(limits.lower) + 4, `T-: ${limits.lower.toFixed(precision)}`, "#666"));
        svg.appendChild(this._createText(labelX, getY(master) + 4, `M: ${master.toFixed(precision)}`, "#16a34a"));

        return svg;
    },

    _createCircle: function(cx, cy, r, fill) {
        const el = document.createElementNS(this.NS, "circle");
        el.setAttribute("cx", cx); el.setAttribute("cy", cy);
        el.setAttribute("r", r); el.setAttribute("fill", fill);
        return el;
    },

    _createLine: function(x1, y1, x2, y2, stroke, width, dash) {
        const el = document.createElementNS(this.NS, "line");
        el.setAttribute("x1", x1); el.setAttribute("y1", y1);
        el.setAttribute("x2", x2); el.setAttribute("y2", y2);
        el.setAttribute("stroke", stroke); el.setAttribute("stroke-width", width);
        if (dash) el.setAttribute("stroke-dasharray", dash);
        return el;
    },

    _createRect: function(x, y, w, h, fill) {
        const el = document.createElementNS(this.NS, "rect");
        el.setAttribute("x", x); el.setAttribute("y", y);
        el.setAttribute("width", w); el.setAttribute("height", Math.max(0, h));
        el.setAttribute("fill", fill);
        return el;
    },

    _createText: function(x, y, textContent, fill, angle=0, fontSize="11px") {
        const el = document.createElementNS(this.NS, "text");
        el.setAttribute("x", x); el.setAttribute("y", y);
        el.setAttribute("fill", fill);
        el.setAttribute("font-size", fontSize);
        el.textContent = textContent;
        
        if (angle !== 0) {
			// rotate(kąt, środek_obrotu_x, środek_obrotu_y)
			el.setAttribute("transform", `rotate(${angle}, ${x}, ${y})`);
		}
        
        return el;
    },

    _calculateScale: function(data, limits) {
        const values = [...data, limits.upper, limits.lower];
        const min = Math.min(...values), max = Math.max(...values);
        const m = (max - min) * 0.1 || 0.1; 
        return { min: min - m, max: max + m };
    }
};

const ReportBuilder = {
    // Główna funkcja budująca strukturę DOM
    
    _buildContent: function(session, stats) {
        const container = document.createElement('div');
        container.className = 'report-wrapper';

        container.appendChild(this._createHeader(session));
        container.appendChild(this._createStatsGrid(session, stats));
        container.appendChild(this._createVisuals(session));
        container.appendChild(this._createMeasurementsGrid(session.measurements, session.masterParams.master, session.masterParams.rf));

        return container;
    },
    // Używane do renderowania raportu wewnątrz aplikacji (raportPage)
    buildDOM: function(session, stats) {
        const fragment = document.createDocumentFragment();
        
        const style = document.createElement('style');
        style.textContent = this._getStyles();
        fragment.appendChild(style);

        fragment.appendChild(this._buildContent(session, stats));
        return fragment;
    },

    _createHeader: function(session) {
        const header = document.createElement('header');
        const h1 = document.createElement('h1');
        h1.textContent = "Raport Metrologiczny SPA";
        const p = document.createElement('p');
        p.textContent = `Maszyna: ${session.machineID} | Sonda: ${session.probeID} | Data: ${new Date().toLocaleString('pl-PL')}`;
        header.append(h1, p);
        return header;
    },

    _createStatsGrid: function(session, stats) {
        const grid = document.createElement('div');
        grid.className = 'stats-grid';
        if (!stats) return grid;

        const data = [
            { label: "Średnia", val: stats.avg.toFixed(session.grad) },
            { label: "Cg", val: stats.cg?.toFixed(2) || "∞" },
            { label: "Cgk", val: stats.cgk?.toFixed(2) || "∞" },
            { label: "Status", val: stats.cgk >= 1.33 ? "OK" : "NOK", cls: stats.cgk >= 1.33 ? "pass" : "fail" }
        ];

        data.forEach(item => {
            const card = document.createElement('div');
            card.className = `stat-card ${item.cls || ''}`;
            const span = document.createElement('span'); span.textContent = item.label;
            const strong = document.createElement('strong'); strong.textContent = item.val;
            card.append(span, strong);
            grid.appendChild(card);
        });
        return grid;
    },

    _createVisuals: function(session) {
        const div = document.createElement('div');
        div.className = 'chart-container';
        const svg = ChartEngine.generateTrendChart(
            session.measurements, 
            session.masterParams.master, 
            session.masterParams.rf,
            session.grad // <-- DODANO PRZEKAZYWANIE PRECYZJI
        );
        div.appendChild(svg);
        return div;
    },

  _createMeasurementsGrid: function(measurements, master, rf) {
    const container = document.createElement('div');
    container.className = 'measurements-grid';

    measurements.forEach((value, index) => {
        const item = document.createElement('div');
        
        // Logika sprawdzania poprawności (isCorrect) na bieżąco:
        const diff = Math.abs(value - master);
        const isCorrect = diff <= rf;
        
        const statusClass = isCorrect ? 'item-pass' : 'item-fail';
        item.className = `measurement-item ${statusClass}`;
        
        // Teraz value jest liczbą, więc .toFixed(3) zadziała bez błędu
        item.innerHTML = `
            <span class="idx">${index + 1}</span>
            <span class="val">${value.toFixed(3)}</span>
        `;
        container.appendChild(item);
    });

    return container;
},
    /**
     * Nowa funkcja: Generuje pełny string HTML (np. do udostępniania)
     * wykorzystując już istniejącą logikę buildDOM
     */
    generateFullHTML: function(session, stats) {
        // Zamiast manipulować obiektem Document, bezpieczniej i czytelniej jest zbudować czysty string
        const contentDOM = this._buildContent(session, stats);
        
        return `<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Raport SPA - ${session.machineNr} - ${session.probeID}</title>
    <style>
        ${this._getStyles()}
    </style>
</head>
<body style="margin: 0; background-color: #f0f2f5;">
    ${contentDOM.outerHTML}
</body>
</html>`;
    },

    _getStyles: function() {
    return `
        /* Zmienne przypisane do głównego kontenera, zamiast do :host */
        .report-wrapper {
            --report-bg: #ffffff;
            --report-text: #1a1a1a;
            --report-muted: #666666;
            --card-border: #e0e0e0;
            --table-border: #dddddd;
            --accent-primary: #007bff;
            
            --color-pass-bg: #e6ffed;
            --color-pass-text: #166534;
            --color-pass-border: #bbf7d0;
            
            --color-fail-bg: #ffeef0;
            --color-fail-text: #991b1b;
            --color-fail-border: #fecaca;
            
            display: block;
            padding: 20px;
            background-color: var(--report-bg); 
            color: var(--report-text);
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            max-width: 10000px;
            margin: 0 auto;
            box-sizing: border-box;
            overflow-x: hidden;
        }

        @media (prefers-color-scheme: dark) {
            .report-wrapper {
                --report-bg: #1e1e1e;
                --report-text: #e0e0e0;
                --report-muted: #a0a0a0;
                --card-border: #333333;
                --table-border: #444444;
            }
        }

        header { 
            margin-bottom: 25px; 
            border-bottom: 2px solid var(--accent-primary); 
            padding-bottom: 15px; 
        }
        
        h1 { margin: 0; font-size: 1.6rem; color: var(--accent-primary); }
        header p { margin: 5px 0; color: var(--report-muted); font-size: 0.9rem; }

        .stats-grid { 
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
            gap: 12px;
            margin: 20px 0;
        }
        
        .stat-card { 
            border: 1px solid var(--card-border); 
            padding: 15px; 
            border-radius: 10px;
            display: flex; 
            flex-direction: column; 
            gap: 5px;
            background: var(--report-bg);
        }

        .stat-card span { 
            font-size: 11px; 
            text-transform: uppercase; 
            color: var(--report-muted); 
            font-weight: 700; 
            letter-spacing: 0.5px;
        }
        
        .stat-card strong { font-size: 1.3rem; }

        .pass { background-color: var(--color-pass-bg); color: var(--color-pass-text); border-color: var(--color-pass-border); }
        .fail { background-color: var(--color-fail-bg); color: var(--color-fail-text); border-color: var(--color-fail-border); }

        .chart-container { 
            margin: 25px 0; 
            border: 1px solid var(--card-border); 
            border-radius: 12px; 
            padding: 15px; 
            background: #ffffff;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        
        svg { width: 100%; height: auto; display: block; }

        /* Styl ekranowy - kafelki obok siebie */
.measurements-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 8px;
    margin-top: 20px;
}

.measurement-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    border-radius: 6px;
    background: var(--report-bg);
    border: 1px solid var(--card-border);
    font-family: monospace;
    font-size: 0.9rem;
}

.measurement-item .idx {
    color: var(--report-muted);
    font-size: 0.7rem;
    font-weight: bold;
}

.measurement-item .val {
    font-weight: bold;
}

/* Kolory specyficzne dla kafelków */
.item-pass { border-left: 3px solid var(--color-pass-text); }
.item-fail { border-left: 3px solid var(--color-fail-text); background: var(--color-fail-bg); }

/* --- STYL DO DRUKU (A4) --- */
@media print {
    .measurements-grid {
        display: block; /* Wyłączamy grid na rzecz kolumn tekstowych */
        column-count: 5; /* Aż 5 kolumn pomiarów obok siebie na A4! */
        column-gap: 10px;
        orphans: 3;
        widows: 3;
    }

    .measurement-item {
        display: flex;
        break-inside: avoid; /* Ważne: kafelek nie może być przecięty między kolumnami */
        margin-bottom: 4px;
        padding: 4px 6px;
        font-size: 10px;
        border: 1px solid #eee !important;
        -webkit-print-color-adjust: exact;
    }
    
    .item-fail {
        background-color: #ffeef0 !important;
        color: #991b1b !important;
    }
}

        @media (max-width: 600px) {
            .table-print-container { column-count: 1; }
        }
        @media (max-width: 400px) {
            .report-wrapper { padding: 10px; }
            .stats-grid { grid-template-columns: 1fr; } 
        }
    `;
    }
};

function raportPage() {
    const host = document.getElementById('report-host');
    if (!host) return;

    let shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
    
    // Czyścimy poprzedni raport
    shadow.replaceChildren(); 

    const stats = calculateStats(
        session.measurements, 
        session.masterParams.master, 
        session.masterParams.rf
    );

    // Budujemy i dodajemy DOM
    const reportFragment = ReportBuilder.buildDOM(session, stats);
    shadow.appendChild(reportFragment);

    changeScreen('report-screen');
}

async function handleFinalizeAndShare() {
    const stats = calculateStats(
        session.measurements, 
        session.masterParams.master, 
        session.masterParams.rf
    );
    
    // Używamy funkcji zwracającej tekst (HTML), a nie DocumentFragment
    const reportHtml = ReportBuilder.generateFullHTML(session, stats);
    
    // Dodano charset=utf-8 dla bezpieczeństwa polskich znaków
    const blob = new Blob([reportHtml], { type: 'text/html;charset=utf-8' });
    const fileName = `Raport_${session.machineNr}_${session.probeID}_${new Date().toISOString().slice(0,10)}.html`;

    try {
        if (navigator.canShare && navigator.canShare({ files: [new File([blob], fileName, { type: 'text/html' })] })) {
            const file = new File([blob], fileName, { type: 'text/html' });
            await navigator.share({
                files: [file],
                title: 'Raport SPA',
                text: `Przesyłam raport metrologiczny dla: ${session.machineNr}`
            });
        } else {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = fileName;
            link.click();
            URL.revokeObjectURL(link.href);
        }
    } catch (err) {
        console.error("Błąd udostępniania:", err);
    }
    
    askUser("Raport został przetworzony", "Zakończyć tą sesję i rozpocząć nową", 
        () => { 
            localStorage.removeItem(LOCALSTORAGE_KEY);
            resetSessionObject();
            changeScreen('machine-select-screen');
        },
        () => {
            changeScreen('measurement-screen');
        }
    );
}

function askUser(title, question, yesAction, noAction, destructiveYes = false) {
    const titleEl = document.getElementById('yes-no-screen-title');
    const subtitleEl = document.getElementById('yes-no-screen-subtitle');
    const yesBtn = document.getElementById('yes-no-screen-yes-btn');
    const noBtn = document.getElementById('yes-no-screen-no-btn');
    
	yesBtn.classList.toggle('btn-success', !destructiveYes);
	yesBtn.classList.toggle('btn-fail', destructiveYes);
	
	noBtn.classList.toggle('btn-success', destructiveYes);
	noBtn.classList.toggle('btn-fail', !destructiveYes);

    // 1. Bezpieczne wpisanie tekstu (Pole, nie funkcja!)
    titleEl.textContent = title;
    subtitleEl.textContent = question;

    // 2. Przypisanie akcji (z nadpisaniem poprzednich, by uniknąć dublowania)
    yesBtn.onclick = () => {
        if (typeof yesAction === 'function') yesAction();
        _cleanupAskButtons(yesBtn, noBtn);
    };

    noBtn.onclick = () => {
        if (typeof noAction === 'function') noAction();
        _cleanupAskButtons(yesBtn, noBtn);
    };

    // 3. Zmiana ekranu
    changeScreen('yes-no-screen');
}

function _cleanupAskButtons(b1, b2) {
    b1.onclick = null;
    b2.onclick = null;
}	
	
const themeWatcher = window.matchMedia('(prefers-color-scheme: dark)');
themeWatcher.addEventListener('change', () => drawChart(session.testLength));

window.onload = init;
    
window.addEventListener('keydown', (event) => {
    const key = event.key.toUpperCase();
    if (session.currentScreen !== 'measurement-screen') return;

	
    // 1. Cyfry, kropka i minus
    if (/^[0-9.\-]$/.test(key)) {
        handleInput(key);
    } 
    // 2. Enter -> DODAJ POMIAR
    else if (key === 'ENTER') {
        event.preventDefault(); // Zapobiega np. wysłaniu formularza
        handleInput('ENTER');
    } 
    // 3. Backspace -> funkcja C (usuwanie znaku)
    else if (key === 'BACKSPACE') {
        handleInput('C');
    }
    // 4. Escape -> może służyć do czyszczenia całego pola (opcjonalnie)
    else if (key === 'ESCAPE') {
        document.getElementById('input-field').value = '';
    }
    else if( key === 'U') {
		undoLast();
	}
});

