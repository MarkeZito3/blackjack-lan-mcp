class Carta {
    constructor(palo, valor) {
        this.palo = palo;
        this.valor = valor;
    }

    toString() {
        const nombreValor = {
            1: 'As',
            11: 'Jota',
            12: 'Reina',
            13: 'Rey'
        };
        const nombrePalo = {
            '♥': 'Corazones',
            '♦': 'Diamantes',
            '♣': 'Tréboles',
            '♠': 'Picas'
        };
        const valor = nombreValor[this.valor] || this.valor;
        return `${valor} de ${nombrePalo[this.palo]}`;
    }

    getValorNumerico() {
        if (this.valor === 1) return 11; // As vale 11 por defecto
        return this.valor > 10 ? 10 : this.valor;
    }
}

class Baraja {
    constructor() {
        this.cartas = [];
        const palos = ['♥', '♦', '♣', '♠'];
        for (let palo of palos) {
            for (let valor = 1; valor <= 13; valor++) {
                this.cartas.push(new Carta(palo, valor));
            }
        }
        this.mezclar();
    }

    mezclar() {
        for (let i = this.cartas.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cartas[i], this.cartas[j]] = [this.cartas[j], this.cartas[i]];
        }
    }

    sacarCarta() {
        return this.cartas.pop();
    }
}

class Mano {
    constructor() {
        this.cartas = [];
    }

    agregarCarta(carta) {
        this.cartas.push(carta);
    }

    getValor() {
        let valor = 0;
        let ases = 0;

        for (let carta of this.cartas) {
            if (carta.valor === 1) ases++;
            valor += carta.getValorNumerico();
        }

        // Ajustar valor de ases si nos pasamos de 21
        while (valor > 21 && ases > 0) {
            valor -= 10;
            ases--;
        }

        return valor;
    }

    toString() {
        return this.cartas.map(carta => carta.toString()).join(', ');
    }
}

class Blackjack {
    constructor() {
        this.baraja = new Baraja();
        this.manoJugador = new Mano();
        this.manoCrupier = new Mano();
        this.juegoTerminado = false;
        this.rol = null; // 'crupier' o 'jugador'
        this.salaId = null;
        this.inicializarElementosUI();
        this.inicializarEventos();
        this.inicializarWebSocket();
        this.jugadoresPlantados = new Set();
    }

    inicializarElementosUI() {
        // Elementos de la pantalla de inicio
        this.pantallaInicio = document.getElementById('pantalla-inicio');
        this.mesaJuego = document.getElementById('mesa');
        this.crearSalaBtn = document.getElementById('crear-sala');
        this.unirseSalaBtn = document.getElementById('unirse-sala');
        this.codigoSalaInput = document.getElementById('codigo-sala');
        this.codigoSalaDisplay = document.getElementById('codigo-sala-display');
        this.codigoSpan = document.getElementById('codigo');
        this.estadoConexion = document.getElementById('estado-conexion');

        // Elementos del juego
        this.manoCrupierElement = document.getElementById('mano-crupier');
        this.manoJugadorElement = document.getElementById('mano-jugador');
        this.valorCrupierElement = document.getElementById('valor-crupier');
        this.valorJugadorElement = document.getElementById('valor-jugador');
        this.mensajeElement = document.getElementById('mensaje');
        this.pedirCartaBtn = document.getElementById('pedir-carta');
        this.plantarseBtn = document.getElementById('plantarse');
        this.nuevaPartidaBtn = document.getElementById('nueva-partida');
    }

    inicializarEventos() {
        this.crearSalaBtn.addEventListener('click', () => this.crearSala());
        this.unirseSalaBtn.addEventListener('click', () => this.unirseSala());
        this.pedirCartaBtn.addEventListener('click', () => this.pedirCarta());
        this.plantarseBtn.addEventListener('click', () => this.plantarse());
        this.nuevaPartidaBtn.addEventListener('click', () => this.iniciarJuego());
    }

    inicializarWebSocket() {
        // Conectar al servidor local
        const wsUrl = 'ws://localhost:3000';
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            this.estadoConexion.textContent = 'Conectado al servidor';
        };

        this.ws.onclose = () => {
            this.estadoConexion.textContent = 'Desconectado del servidor';
        };

        this.ws.onerror = () => {
            this.estadoConexion.textContent = 'Error de conexión';
        };

        this.ws.onmessage = (evento) => {
            const data = JSON.parse(evento.data);
            this.manejarMensajeWebSocket(data);
        };
    }

    manejarMensajeWebSocket(data) {
        switch(data.tipo) {
            case 'sala_creada':
                this.salaId = data.salaId;
                this.rol = 'crupier';
                this.codigoSpan.textContent = this.salaId;
                this.codigoSalaDisplay.style.display = 'block';
                this.estadoConexion.textContent = 'Esperando a otro jugador...';
                break;

            case 'unido_exitosamente':
                this.salaId = data.salaId;
                this.rol = 'jugador';
                this.pantallaInicio.style.display = 'none';
                this.mesaJuego.style.display = 'block';
                break;

            case 'jugador_unido':
                this.pantallaInicio.style.display = 'none';
                this.mesaJuego.style.display = 'block';
                if (this.rol === 'crupier') {
                    this.iniciarJuego();
                }
                break;

            case 'accion_jugador':
                this.manejarAccionJugador(data);
                break;

            case 'crupier_desconectado':
                this.mostrarMensaje('El crupier se ha desconectado');
                this.terminarJuego();
                break;

            case 'jugador_desconectado':
                this.mostrarMensaje(`El jugador ${data.jugadorId} se ha desconectado`);
                break;
        }
    }

    crearSala() {
        this.ws.send(JSON.stringify({
            tipo: 'crear_sala'
        }));
    }

    unirseSala() {
        const codigo = this.codigoSalaInput.value.trim();
        if (codigo) {
            this.ws.send(JSON.stringify({
                tipo: 'unirse_sala',
                salaId: codigo
            }));
        }
    }

    enviarAccion(accion, datos = {}) {
        this.ws.send(JSON.stringify({
            tipo: 'accion_jugador',
            accion,
            ...datos
        }));
    }

    manejarAccionJugador(data) {
        switch(data.accion) {
            case 'cartas_iniciales':
                if (this.rol === 'jugador') {
                    this.manoJugador = new Mano();
                    data.cartas.forEach(carta => {
                        this.manoJugador.agregarCarta(new Carta(carta.palo, carta.valor));
                    });
                    this.manoCrupier = new Mano();
                    data.cartasCrupier.forEach(carta => {
                        this.manoCrupier.agregarCarta(new Carta(carta.palo, carta.valor));
                    });
                    this.actualizarMano(this.manoJugadorElement, this.manoJugador);
                    this.actualizarMano(this.manoCrupierElement, this.manoCrupier, true);
                    this.actualizarValores();
                }
                break;

            case 'pedir_carta':
                if (this.rol === 'crupier') {
                    const carta = this.baraja.sacarCarta();
                    this.enviarAccion('carta_dada', { carta, jugadorId: data.jugadorId });
                }
                break;

            case 'carta_dada':
                if (this.rol === 'jugador') {
                    const carta = new Carta(data.carta.palo, data.carta.valor);
                    this.manoJugador.agregarCarta(carta);
                    this.actualizarMano(this.manoJugadorElement, this.manoJugador);
                    this.actualizarValores();

                    if (this.manoJugador.getValor() > 21) {
                        this.mostrarMensaje('¡Te has pasado de 21! ¡Has perdido!');
                        this.enviarAccion('plantarse');
                        this.terminarJuego();
                    }
                }
                break;

            case 'plantarse':
                if (this.rol === 'crupier') {
                    this.jugadoresPlantados.add(data.jugadorId);
                    if (this.jugadoresPlantados.size === Object.keys(this.jugadores).length) {
                        this.jugarTurnoCrupier();
                    }
                }
                break;

            case 'turno_crupier':
                if (this.rol === 'jugador') {
                    const carta = new Carta(data.carta.palo, data.carta.valor);
                    this.manoCrupier.agregarCarta(carta);
                    this.actualizarMano(this.manoCrupierElement, this.manoCrupier, false);
                    if (data.valorFinal !== undefined) {
                        this.valorCrupierElement.textContent = `Valor: ${data.valorFinal}`;
                        this.determinarGanador(data.valorFinal);
                    }
                }
                break;
        }
    }

    crearElementoCarta(carta, oculta = false) {
        const cartaElement = document.createElement('div');
        cartaElement.className = 'carta';
        if (oculta) {
            cartaElement.innerHTML = '<div class="palo">?</div>';
            cartaElement.style.backgroundColor = '#000066';
            return cartaElement;
        }

        const esRoja = carta.palo === '♥' || carta.palo === '♦';
        if (esRoja) cartaElement.classList.add('roja');

        const valor = carta.toString().split(' de ')[0];
        const palo = carta.palo;

        cartaElement.innerHTML = `
            <div>${valor}</div>
            <div class="palo">${palo}</div>
        `;
        return cartaElement;
    }

    actualizarMano(manoElement, mano, ocultarSegunda = false) {
        manoElement.innerHTML = '';
        mano.cartas.forEach((carta, index) => {
            const oculta = ocultarSegunda && index === 1;
            manoElement.appendChild(this.crearElementoCarta(carta, oculta));
        });
    }

    actualizarValores() {
        this.valorJugadorElement.textContent = `Valor: ${this.manoJugador.getValor()}`;
        if (!this.juegoTerminado) {
            this.valorCrupierElement.textContent = 'Valor: ?';
        } else {
            this.valorCrupierElement.textContent = `Valor: ${this.manoCrupier.getValor()}`;
        }
    }

    mostrarMensaje(mensaje) {
        this.mensajeElement.textContent = mensaje;
    }

    async iniciarJuego() {
        this.baraja = new Baraja();
        this.manoJugador = new Mano();
        this.manoCrupier = new Mano();
        this.juegoTerminado = false;
        this.jugadoresPlantados.clear();

        // Limpiar el tablero
        this.manoCrupierElement.innerHTML = '';
        this.manoJugadorElement.innerHTML = '';
        this.mensajeElement.textContent = '';

        // Mostrar/ocultar botones y habilitarlos
        this.pedirCartaBtn.style.display = 'inline';
        this.plantarseBtn.style.display = 'inline';
        this.nuevaPartidaBtn.style.display = 'none';
        this.pedirCartaBtn.disabled = false;  // Habilitar botón
        this.plantarseBtn.disabled = false;   // Habilitar botón

        // Repartir cartas iniciales
        if (this.rol === 'crupier') {
            const cartasIniciales = {
                crupier: [this.baraja.sacarCarta(), this.baraja.sacarCarta()]
            };
            
            // Asignar cartas iniciales a cada jugador
            Object.keys(this.jugadores || {}).forEach(jugadorId => {
                cartasIniciales[jugadorId] = [this.baraja.sacarCarta(), this.baraja.sacarCarta()];
            });

            this.manoCrupier = new Mano();
            cartasIniciales.crupier.forEach(carta => this.manoCrupier.agregarCarta(carta));
            
            this.enviarAccion('cartas_iniciales', {
                cartasIniciales,
                baraja: this.baraja
            });

            this.actualizarMano(this.manoCrupierElement, this.manoCrupier);
            this.actualizarValores();
        }

        this.actualizarMano(this.manoJugadorElement, this.manoJugador);
        this.actualizarMano(this.manoCrupierElement, this.manoCrupier, true);
        this.actualizarValores();

        if (this.manoJugador.getValor() === 21) {
            this.mostrarMensaje('¡Blackjack! ¡Has ganado!');
            this.terminarJuego();
        }
    }

    pedirCarta() {
        this.manoJugador.agregarCarta(this.baraja.sacarCarta());
        this.actualizarMano(this.manoJugadorElement, this.manoJugador);
        this.actualizarValores();

        if (this.manoJugador.getValor() > 21) {
            this.mostrarMensaje('¡Te has pasado de 21! ¡Has perdido!');
            this.terminarJuego();
        } else if (this.manoJugador.getValor() === 21) {
            this.mostrarMensaje('¡21! ¡Excelente!');
            this.plantarse();
        }
    }

    async plantarse() {
        this.pedirCartaBtn.disabled = true;
        this.plantarseBtn.disabled = true;

        // Mostrar la carta oculta del crupier
        this.actualizarMano(this.manoCrupierElement, this.manoCrupier);

        // El crupier toma cartas hasta tener 17 o más
        while (this.manoCrupier.getValor() < 17) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            this.manoCrupier.agregarCarta(this.baraja.sacarCarta());
            this.actualizarMano(this.manoCrupierElement, this.manoCrupier);
        }

        this.determinarGanador();
    }

    async jugarTurnoCrupier() {
        // Mostrar todas las cartas del crupier
        this.actualizarMano(this.manoCrupierElement, this.manoCrupier, false);

        while (this.manoCrupier.getValor() < 17) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const carta = this.baraja.sacarCarta();
            this.manoCrupier.agregarCarta(carta);
            this.enviarAccion('turno_crupier', { 
                carta,
                valorFinal: this.manoCrupier.getValor() 
            });
            this.actualizarMano(this.manoCrupierElement, this.manoCrupier, false);
        }

        const valorFinal = this.manoCrupier.getValor();
        this.enviarAccion('turno_crupier', { valorFinal });
        this.determinarGanador(valorFinal);
    }

    determinarGanador(valorCrupier = this.manoCrupier.getValor()) {
        const valorJugador = this.manoJugador.getValor();
        this.valorCrupierElement.textContent = `Valor: ${valorCrupier}`;

        if (valorCrupier > 21) {
            this.mostrarMensaje('¡El crupier se ha pasado! ¡Has ganado!');
        } else if (valorJugador > valorCrupier) {
            this.mostrarMensaje('¡Has ganado!');
        } else if (valorJugador < valorCrupier) {
            this.mostrarMensaje('¡El crupier gana!');
        } else {
            this.mostrarMensaje('¡Empate!');
        }

        this.terminarJuego();
    }

    terminarJuego() {
        this.juegoTerminado = true;
        this.pedirCartaBtn.style.display = 'none';
        this.plantarseBtn.style.display = 'none';
        this.nuevaPartidaBtn.style.display = 'inline';
        this.actualizarValores();

        if (this.rol === 'crupier') {
            this.enviarAccion('juego_terminado', {
                valorJugador: this.manoJugador.getValor(),
                valorCrupier: this.manoCrupier.getValor()
            });
        }
    }
}

// Iniciar el juego cuando se carga la página
window.addEventListener('DOMContentLoaded', () => {
    const juego = new Blackjack();
});