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


// TWOJE DANE
    const LOCALSTORAGE_KEY = 'randr-session';
    
    const machinesDatabase = {
    "M001": {
        nazwa: "RETURN SPRING SNR ASSY",
        nr: "A2-SUB-0020",
        sondy: {
            "LF": { nazwa_cechy: "SWASH PLATE THICKNESS", zero: { rf: 0.02, graduation: 0.0001, master: 0 }, span: { rf: 0.02, graduation: 0.0001, master: 1.6 } },
            "RF": { nazwa_cechy: "SWASH PLATE THICKNESS", zero: { rf: 0.02, graduation: 0.0001, master: 0 }, span: { rf: 0.02, graduation: 0.0001, master: 1.6 } },
            "LB": { nazwa_cechy: "SWASH PLATE THICKNESS", zero: { rf: 0.02, graduation: 0.0001, master: 0 }, span: { rf: 0.02, graduation: 0.0001, master: 1.6 } },
            "RB": { nazwa_cechy: "SWASH PLATE THICKNESS", zero: { rf: 0.02, graduation: 0.0001, master: 0 }, span: { rf: 0.02, graduation: 0.0001, master: 1.6 } },
            "SNR": { nazwa_cechy: "SNR HEIGHT", zero: { rf: 0.6, graduation: 0.001, master: 0 }, span: { rf: 0.6, graduation: 0.001, master: 2.0 } },
            "PinA": { nazwa_cechy: "PIN HEIGHT A", zero: { rf: 0.2, graduation: 0.001, master: 0 }, span: { rf: 0.2, graduation: 0.001, master: 1.5 } },
            "PinB": { nazwa_cechy: "PIN HEIGHT B", zero: { rf: 0.2, graduation: 0.001, master: 0 }, span: { rf: 0.2, graduation: 0.001, master: 1.5 } }
        }
    }
};

    // STAN SESJI I ZMIENNE POMIAROWE
    // Zastąp obecny obiekt session tym:
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
	
	const SESSION_TIMEOUT = 10; //(sek.)

    // INICJALIZACJA
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
			// Używamy Optional Chaining (?.) i domyślnych wartości dla bezpieczeństwa danych
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

/** * Funkcje pomocnicze podnoszące czytelność (Clean Code) 
 */

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

function measurementsBack() {
	if (session.measurements.length === 0) {
		changeScreen('test-length-screen');
	} else {
		changeScreen('confirm-leave-screen');
	}
}

function handleStartNewAfterExpired() {
    localStorage.removeItem(LOCALSTORAGE_KEY);
    resetSessionObject();
    changeScreen('machine-select-screen');
}

/**
 * Całkowity reset stanu aplikacji w pamięci RAM.
 * Przywraca obiekt session do stanu pierwotnego, 
 * przygotowując go na nowy proces pomiarowy R&R.
 */
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

	
	// Tworzy przyciski na ekranie machine-select-screen z nr maszyny oraz jej opisem
	// keysToRender to przefiltrowany machinesDatabase z funkcji searchMachines
	// jeżeli nie przekazano parametru - renderuj wszyskie.
	function renderMachineButtons(keysToRender = Object.keys(machinesDatabase)) {
		
		const container = document.getElementById('machine-buttons-container');
		container.textContent = '';

		if (keysToRender.length === 0) { 
			const emptyResult = document.createElement('div');
			emptyResult.className = 'empty-result-msg';
			emptyResult.textContent = 'brak wyników ...';
			container.append(emptyResult);
			return;
		}
	
		const fragment = document.createDocumentFragment();
		keysToRender.forEach( id => {
			const machineData = machinesDatabase[id];
			const btn = document.createElement('button');
			btn.className = 'btn btn-outline sonda-btn';
			
			// Nr maszyny
			const spanId = document.createElement('span');
			spanId.className = 'sonda-id';
			spanId.textContent = machineData.nr;
			
			// Opis maszyny
			const spanDesc = document.createElement('span');
			spanDesc.className = 'sonda-desc';
			spanDesc.textContent = machineData.nazwa;
			
			btn.append(spanId, spanDesc);
			btn.onclick = () => { handleMachineSelect(id);}
			
			fragment.append(btn);
		});
		
		container.append(fragment);
	}
	
//COMPLETE		
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
	
 // Pomocnicza funkcja zapisu - IT to uwielbia (Single Source of Truth)
function saveSession() {
    session.date = Date.now(); // Używamy nowocześniejszego Date.now()
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(session));
}

function handleInput(value) {
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
            
            if (navigator.vibrate) navigator.vibrate(40);
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


//DO POPRAWY
	function resetAppToStart() {
    // Zamiast confirm() można w przyszłości wstawić ładny modal HTML
    if (confirm("Czy na pewno chcesz przerwać i usunąć wszystkie dane obecnej sesji?")) {
        
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
    }
}

// OBSŁUGA WYBORÓW
function handleMachineSelect(id) {
	if (!id) return;
		
	session.machineID = id;
	session.machineName = machinesDatabase[id].nazwa;
	session.machineNr = machinesDatabase[id].nr;
	document.getElementById('current-machine-label').textContent = session.machineNr;
	renderProbeButtons(id);
	changeScreen('probe-select-screen');
}
   
    function renderProbeButtons(machineId) {
		const container = document.getElementById('probe-buttons-container');
		container.textContent = '';
		const fragment = document.createDocumentFragment();
		const probes = machinesDatabase[machineId].sondy;
		
		for (let probeId in probes) {
			const btn = document.createElement('button');
			btn.className = 'btn btn-outline sonda-btn';
			
			const sondaId = document.createElement('span');
			sondaId.className = 'sonda-id';
			sondaId.textContent = probeId;
			
			const sondaDesc = document.createElement('span');
			sondaDesc.className = 'sonda-desc';
			sondaDesc.textContent = probes[probeId].nazwa_cechy;
			
			btn.append(sondaId, sondaDesc);
			btn.onclick = () => {
				session.probeID = probeId;
				session.probe = probes[probeId].nazwa_cechy;
				changeScreen('master-select-screen');
			};
			
			fragment.append(btn);
		}
		
		container.append(fragment);
	}

    function handleMasterSelect(type) {
        session.masterType = type;
        session.masterParams = machinesDatabase[session.machineID].sondy[session.probeID][type];
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

    updateMainIndicators(stats, f);
    updateMaxIndicators(ideal, n);

    // 4. Sterowanie interfejsem (Używamy klas, nie styli inline)
    const isFinished = n >= testLength;
    document.getElementById('input-container').classList.toggle('hidden', isFinished);
    document.getElementById('keypad').classList.toggle('hidden', isFinished);
    document.getElementById('btn-final').classList.toggle('hidden', !isFinished);

    if (typeof drawChart === 'function') drawChart(session.testLength);
}

/** * POMOCNICZE FUNKCJE (Separacja logiki od widoku)
 */

function renderHistoryLog(measurements, master, tolerance, precision) {
    const log = document.getElementById('history-log');
    log.textContent = ''; // Czyścimy bezpiecznie
    const fragment = document.createDocumentFragment();

    // Renderujemy od najnowszego (reverse)
    [...measurements].reverse().forEach(v => {
        const diff = Math.abs(v - master);
        const item = document.createElement('div');
        item.className = 'history-item';
        item.textContent = v.toFixed(precision);

        // Klasy zamiast kolorów wpisanych na sztywno w JS
        if (diff > tolerance / 2) item.classList.add('text-danger');
        else if (diff > (tolerance * 0.1)) item.classList.add('text-warning');
        else item.classList.add('text-success');

        fragment.append(item);
    });
    log.append(fragment);
}

function updateMainIndicators(stats, precision) {
    const elements = {
        avg: document.getElementById('val-avg'),
        cg: document.getElementById('val-cg'),
        cgk: document.getElementById('val-cgk'),
        indCg: document.getElementById('ind-cg'),
        indCgk: document.getElementById('ind-cgk')
    };

    if (!stats) {
        ['avg', 'cg', 'cgk'].forEach(key => elements[key].textContent = "--");
        return;
    }

    elements.avg.textContent = stats.avg.toFixed(precision);
    
    // Obsługa Twojego nowego "null" z calculateStats
    elements.cg.textContent = stats.cg === null ? "∞" : stats.cg.toFixed(2);
    elements.cgk.textContent = stats.cgk === null ? "∞" : stats.cgk.toFixed(2);

    // Zamiast borderLeftColor - dodajemy klasę stanu
    if (stats.cg !== null) {
        elements.indCg.classList.toggle('status-pass', stats.cg >= 1.33);
        elements.indCg.classList.toggle('status-fail', stats.cg < 1.33);
    }
    if (stats.cgk !== null) {
        elements.indCgk.classList.toggle('status-pass', stats.cgk >= 1.33);
        elements.indCgk.classList.toggle('status-fail', stats.cgk < 1.33);
    }
}

function updateMaxIndicators(ideal, n) {
    const mInfo = document.getElementById('measurement-info');
    if (!mInfo) return;

    if (!ideal || n < 2) {
        mInfo.textContent = 'Oczekiwanie na dane...';
        mInfo.className = 'measurements-ind-status';
        return;
    }

    mInfo.textContent = ''; // Czyścimy pod bezpieczne append
    
    const cgVal = ideal.cg === null ? "∞" : ideal.cg.toFixed(2);
    const cgkVal = ideal.cgk === null ? "∞" : ideal.cgk.toFixed(2);

    const divCg = document.createElement('div');
    divCg.className = `measurements-ind ${ideal.cg >= 1.33 ? 'positive' : 'failed'}`;
    divCg.textContent = `Max Cg: ${cgVal}`;

    const divCgk = document.createElement('div');
    divCgk.className = `measurements-ind ${ideal.cgk >= 1.33 ? 'positive' : 'failed'}`;
    divCgk.textContent = `Max Cgk: ${cgkVal}`;

    mInfo.append(divCg, divCgk);
}
	
/**
 * Pobiera kolory zdefiniowane w CSS. 
 * Robimy to RAZ na początku rysowania, by nie obciążać przeglądarki w pętlach.
 */
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
        padding: { top: 40, right: 60, bottom: 40, left: 60 },
        pointRadius: 4
    },

    // ZMIANA: Zwraca obiekt SVGElement zamiast stringa
    generateTrendChart: function(data, master, rf) {
        const { width, height, padding } = this.CONFIG;
        const svg = document.createElementNS(this.NS, "svg");
        svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

        if (!data || data.length === 0) {
            const text = document.createElementNS(this.NS, "text");
            text.setAttribute("x", "50%"); text.setAttribute("y", "50%");
            text.setAttribute("text-anchor", "middle");
            text.textContent = "Brak danych";
            svg.appendChild(text);
            return svg;
        }

        const limits = { upper: master + (rf / 2), lower: master - (rf / 2) };
        const { min, max } = this._calculateScale(data, limits);
        
        const getX = (i) => padding.left + (i / (data.length > 1 ? data.length - 1 : 1)) * (width - padding.left - padding.right);
        const getY = (val) => height - padding.bottom - ((val - min) / (max - min)) * (height - padding.top - padding.bottom);

        // Tło tolerancji
        svg.appendChild(this._createRect(padding.left, getY(limits.upper), width - padding.left - padding.right, getY(limits.lower) - getY(limits.upper), "rgba(34, 197, 94, 0.1)"));
        // Linia Master
        svg.appendChild(this._createLine(padding.left, getY(master), width - padding.right, getY(master), "#22c55e", "2", "5,5"));

        // Punkty
        data.forEach((val, i) => {
            const isOut = val > limits.upper || val < limits.lower;
            svg.appendChild(this._createCircle(getX(i), getY(val), this.CONFIG.pointRadius, isOut ? "#ef4444" : "#3b82f6"));
        });

        return svg;
    },

    _createCircle: function(cx, cy, r, fill) {
        const el = document.createElementNS(this.NS, "circle");
        el.setAttribute("cx", cx); el.setAttribute("cy", cy);
        el.setAttribute("r", r); el.setAttribute("fill", fill);
        el.setAttribute("stroke", "#fff");
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

    _calculateScale: function(data, limits) {
        const values = [...data, limits.upper, limits.lower];
        const min = Math.min(...values), max = Math.max(...values);
        const m = (max - min) * 0.2 || 0.1;
        return { min: min - m, max: max + m };
    }
};

const ReportBuilder = {
    // Główna funkcja budująca strukturę DOM
    buildDOM: function(session, stats) {
        const fragment = document.createDocumentFragment();
        
        const style = document.createElement('style');
        style.textContent = this._getStyles();
        fragment.appendChild(style);

        const container = document.createElement('div');
        container.className = 'report-wrapper';

        container.appendChild(this._createHeader(session));
        container.appendChild(this._createStatsGrid(session, stats));
        container.appendChild(this._createVisuals(session));
        container.appendChild(this._createTable(session.measurements));

        fragment.appendChild(container);
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
            { label: "Cg", val: stats.cg?.toFixed(3) || "∞" },
            { label: "Cgk", val: stats.cgk?.toFixed(3) || "∞" },
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
            session.masterParams.rf
        );
        div.appendChild(svg);
        return div;
    },

    _createTable: function(data) {
        const table = document.createElement('table');
        const tbody = document.createElement('tbody');
        data.forEach((val, i) => {
            const tr = document.createElement('tr');
            const td1 = document.createElement('td'); td1.textContent = i + 1;
            const td2 = document.createElement('td'); td2.textContent = val.toFixed(4);
            tr.append(td1, td2);
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        return table;
    },

    /**
     * Nowa funkcja: Generuje pełny string HTML (np. do udostępniania)
     * wykorzystując już istniejącą logikę buildDOM
     */
    generateFullHTML: function(session, stats) {
        const doc = document.implementation.createHTMLDocument("Raport");
        const content = this.buildDOM(session, stats);
        doc.body.appendChild(content);
        return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
    },

    _getStyles: function() {
    return `
        /* 1. Definicja zmiennych (Motyw Jasny - domyślny) */
        :host {
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
        }

        /* 2. Motyw Ciemny (automatyczny) */
        @media (prefers-color-scheme: dark) {
            :host {
                --report-bg: #121212;
                --report-text: #e0e0e0;
                --report-muted: #a0a0a0;
                --card-border: #333333;
                --table-border: #444444;
                
                --color-pass-bg: #062d14;
                --color-pass-text: #4ade80;
                --color-pass-border: #166534;
                
                --color-fail-bg: #3f0e0e;
                --color-fail-text: #f87171;
                --color-fail-border: #991b1b;
            }
        }

        /* 3. Style strukturalne */
        .report-wrapper { 
            padding: 30px; 
            background-color: var(--report-bg); 
            color: var(--report-text);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.5;
        }

        header { margin-bottom: 30px; border-bottom: 2px solid var(--card-border); padding-bottom: 10px; }
        h1 { margin: 0; font-size: 24px; color: var(--accent-primary); }
        header p { margin: 5px 0; color: var(--report-muted); font-size: 14px; }

        .stats-grid { display: flex; gap: 15px; margin: 25px 0; }
        .stat-card { 
            border: 1px solid var(--card-border); 
            padding: 15px; 
            flex: 1; 
            border-radius: 8px;
            display: flex; 
            flex-direction: column; 
            gap: 5px;
        }
        .stat-card span { font-size: 12px; text-transform: uppercase; color: var(--report-muted); font-weight: 600; }
        .stat-card strong { font-size: 18px; }

        .pass { background-color: var(--color-pass-bg); color: var(--color-pass-text); border-color: var(--color-pass-border); }
        .fail { background-color: var(--color-fail-bg); color: var(--color-fail-text); border-color: var(--color-fail-border); }

        .chart-container { margin: 30px 0; border: 1px solid var(--card-border); border-radius: 8px; padding: 15px; background: #fff; }
        svg { width: 100%; height: auto; display: block; }

        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
        th { background-color: var(--card-border); text-align: left; padding: 10px; }
        td { border-bottom: 1px solid var(--table-border); padding: 8px 10px; }

        /* 4. Obsługa Wydruku */
        @media print {
            :host {
                --report-bg: #ffffff;
                --report-text: #000000;
                --card-border: #cccccc;
                --table-border: #000000;
            }
            
            .report-wrapper { padding: 0; }
            
            .stat-card { 
                border: 1px solid #000 !important; 
                background: none !important; 
                color: #000 !important;
                break-inside: avoid;
            }
            
            .chart-container { 
                border: 1px solid #000; 
                break-inside: avoid;
            }

            /* Ukrywamy elementy interaktywne jeśli są w Shadow DOM */
            button, .no-print { display: none !important; }

            /* Zapewnienie czerni tekstu dla lepszej kserokopii */
            h1, strong, td { color: #000 !important; }
            
            @page {
                margin: 1.5cm;
            }
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

    changeScreen('raport-screen');
}

async function handleFinalizeAndShare() {
    const reportHtml = generateFullHTML();
    const blob = new Blob([reportHtml], { type: 'text/html' });
    const fileName = `Raport_${session.machineNr}_${session.probeID}_${new Date().toISOString().slice(0,10)}.html`;

    try {
        // Sprawdzamy czy przeglądarka wspiera Web Share API dla plików
        if (navigator.canShare && navigator.canShare({ files: [new File([blob], fileName, { type: 'text/html' })] })) {
            const file = new File([blob], fileName, { type: 'text/html' });
            await navigator.share({
                files: [file],
                title: 'Raport SPA',
                text: `Przesyłam raport metrologiczny dla: ${session.machineNr}`
            });
        } else {
            // Plan B: Jeśli Share API nie jest wspierane lub nie obsługuje plików (np. niektóre przeglądarki desktopowe)
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = fileName;
            link.click();
            URL.revokeObjectURL(link.href);
            alert("Raport został pobrany do pamięci urządzenia.");
        }
    } catch (err) {
        console.error("Błąd udostępniania:", err);
        // Nie przerywamy procesu, jeśli użytkownik po prostu anulował okno udostępniania
    }

    // Zamiast reload(), pytamy o nową sesję
    if (confirm("Raport przetworzony. Czy chcesz zakończyć tę sesję i rozpocząć nowy pomiar?")) {
        localStorage.removeItem(LOCALSTORAGE_KEY);
        resetSessionObject();
        changeScreen('machine-select-screen');
    }
}
// --- AUTOMATYCZNE ODŚWIEŻANIE PRZY ZMIANIE TRYBU DARK/LIGHT ---
const themeWatcher = window.matchMedia('(prefers-color-scheme: dark)');
themeWatcher.addEventListener('change', () => drawChart(session.testLength));

window.onload = init;
    
    // Obsługa klawiatury fizycznej
window.addEventListener('keydown', (event) => {
    const key = event.key.toUpperCase();

    // 1. Cyfry, kropka i minus
    if (/^[0-9.\-]$/.test(key)) {
        handleInput(key);
    } 
    // 2. Enter -> DODAJ POMIAR
    else if (key === 'Enter') {
        event.preventDefault(); // Zapobiega np. wysłaniu formularza
        handleInput('ENTER');
    } 
    // 3. Backspace -> funkcja C (usuwanie znaku)
    else if (key === 'Backspace') {
        handleInput('C');
    }
    // 4. Escape -> może służyć do czyszczenia całego pola (opcjonalnie)
    else if (key === 'Escape') {
        document.getElementById('input-field').value = '';
    }
    else if( key === 'U') {
		undoLast();
	}
});
