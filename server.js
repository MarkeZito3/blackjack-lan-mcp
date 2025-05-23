const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Habilitar CORS para todas las rutas
app.use(cors());

// Servir archivos estáticos
app.use(express.static(__dirname));

// Ruta específica para la página principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'blackjack.html'));
});

const salas = new Map();

wss.on('connection', (ws) => {
    console.log('Nueva conexión establecida');
    let salaId = '';
    let jugadorId = '';
    let nombreJugador = '';

    ws.on('message', (mensaje) => {
        const data = JSON.parse(mensaje);
        console.log('Mensaje recibido:', data);
        
        switch(data.tipo) {
            case 'crear_sala':
                salaId = Math.random().toString(36).substring(2, 8);
                jugadorId = 'crupier';
                nombreJugador = data.nombre;
                salas.set(salaId, {
                    crupier: {
                        ws: ws,
                        nombre: nombreJugador,
                        mano: [],
                        valor: 0
                    },
                    jugadores: {},
                    estado: 'esperando',
                    baraja: []
                });
                ws.send(JSON.stringify({
                    tipo: 'sala_creada',
                    salaId,
                    jugadorId
                }));
                console.log(`Sala creada: ${salaId} por ${nombreJugador}`);
                break;

            case 'unirse_sala':
                salaId = data.salaId;
                nombreJugador = data.nombre;
                if (salas.has(salaId)) {
                    const sala = salas.get(salaId);
                    jugadorId = 'jugador' + Object.keys(sala.jugadores).length;
                    sala.jugadores[jugadorId] = {
                        ws: ws,
                        nombre: nombreJugador,
                        mano: [],
                        valor: 0
                    };
                    
                    // Preparar lista de jugadores sin los objetos ws
                    const jugadoresInfo = {
                        crupier: { nombre: sala.crupier.nombre }
                    };
                    Object.entries(sala.jugadores).forEach(([id, jugador]) => {
                        jugadoresInfo[id] = { nombre: jugador.nombre };
                    });

                    // Notificar al crupier
                    sala.crupier.ws.send(JSON.stringify({
                        tipo: 'jugador_unido',
                        jugadorId,
                        nombre: nombreJugador
                    }));
                    
                    // Notificar al nuevo jugador
                    ws.send(JSON.stringify({
                        tipo: 'unido_exitosamente',
                        jugadorId,
                        salaId,
                        jugadores: jugadoresInfo
                    }));

                    // Notificar a los demás jugadores
                    Object.entries(sala.jugadores).forEach(([id, jugador]) => {
                        if (id !== jugadorId) {
                            jugador.ws.send(JSON.stringify({
                                tipo: 'jugador_unido',
                                jugadorId,
                                nombre: nombreJugador
                            }));
                        }
                    });

                    if (Object.keys(sala.jugadores).length === 1) {
                        sala.estado = 'completa';
                        sala.crupier.ws.send(JSON.stringify({ tipo: 'iniciar_juego' }));
                        Object.values(sala.jugadores).forEach(jugador => {
                            jugador.ws.send(JSON.stringify({ tipo: 'iniciar_juego' }));
                        });
                    }
                } else {
                    ws.send(JSON.stringify({
                        tipo: 'error',
                        mensaje: 'Sala no encontrada'
                    }));
                }
                break;

            case 'accion_jugador':
                if (salas.has(salaId)) {
                    const sala = salas.get(salaId);
                    if (data.accion === 'cartas_iniciales' && jugadorId === 'crupier') {
                        // Distribuir las cartas iniciales a todos los jugadores
                        sala.baraja = data.baraja;
                        Object.entries(sala.jugadores).forEach(([id, jugador]) => {
                            jugador.mano = data.cartasIniciales[id] || [];
                            jugador.ws.send(JSON.stringify({
                                tipo: 'accion_jugador',
                                accion: 'cartas_iniciales',
                                cartas: jugador.mano,
                                cartasCrupier: data.cartasIniciales.crupier
                            }));
                        });
                        sala.crupier.mano = data.cartasIniciales.crupier;
                    } else if (data.accion === 'juego_terminado') {
                        // Enviar el estado final del juego a todos los jugadores
                        Object.values(sala.jugadores).forEach(jugador => {
                            jugador.ws.send(JSON.stringify({
                                tipo: 'accion_jugador',
                                accion: 'juego_terminado',
                                valorHost: data.valorHost,
                                cartasHost: data.cartasHost,
                                jugadores: data.jugadores
                            }));
                        });
                    } else if (data.accion === 'pedir_carta') {
                        // Manejar petición de carta
                        if (jugadorId !== 'crupier') {
                            sala.crupier.ws.send(JSON.stringify({
                                tipo: 'accion_jugador',
                                accion: 'pedir_carta',
                                jugadorId
                            }));
                        }
                    } else if (data.accion === 'carta_dada') {
                        // Enviar la carta al jugador específico
                        const jugador = sala.jugadores[data.jugadorId];
                        if (jugador) {
                            jugador.ws.send(JSON.stringify({
                                tipo: 'accion_jugador',
                                accion: 'carta_dada',
                                carta: data.carta
                            }));
                        }
                    } else if (data.accion === 'plantarse') {
                        // Notificar al crupier que el jugador se plantó
                        sala.crupier.ws.send(JSON.stringify({
                            tipo: 'accion_jugador',
                            accion: 'plantarse',
                            jugadorId
                        }));
                    } else if (data.accion === 'turno_crupier') {
                        // Transmitir las acciones del crupier a todos los jugadores
                        Object.values(sala.jugadores).forEach(jugador => {
                            jugador.ws.send(JSON.stringify({
                                tipo: 'accion_jugador',
                                accion: 'turno_crupier',
                                carta: data.carta,
                                valorFinal: data.valorFinal
                            }));
                        });
                    }
                }
                break;
        }
    });

    ws.on('close', () => {
        console.log(`Conexión cerrada para ${nombreJugador} (${jugadorId}) en sala ${salaId}`);
        if (salaId && salas.has(salaId)) {
            const sala = salas.get(salaId);
            if (jugadorId === 'crupier') {
                Object.values(sala.jugadores).forEach(jugador => {
                    jugador.ws.send(JSON.stringify({
                        tipo: 'crupier_desconectado',
                        nombre: nombreJugador
                    }));
                });
                salas.delete(salaId);
            } else {
                delete sala.jugadores[jugadorId];
                // Notificar al crupier
                sala.crupier.ws.send(JSON.stringify({
                    tipo: 'jugador_desconectado',
                    jugadorId,
                    nombre: nombreJugador
                }));
                // Notificar a los demás jugadores
                Object.values(sala.jugadores).forEach(jugador => {
                    jugador.ws.send(JSON.stringify({
                        tipo: 'jugador_desconectado',
                        jugadorId,
                        nombre: nombreJugador
                    }));
                });
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor ejecutándose en el puerto ${PORT}`);
});