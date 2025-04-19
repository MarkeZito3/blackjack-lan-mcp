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

const salas = new Map();

wss.on('connection', (ws) => {
    console.log('Nueva conexión establecida');
    let salaId = '';
    let jugadorId = '';

    ws.on('message', (mensaje) => {
        const data = JSON.parse(mensaje);
        console.log('Mensaje recibido:', data);
        
        switch(data.tipo) {
            case 'crear_sala':
                salaId = Math.random().toString(36).substring(2, 8);
                jugadorId = 'crupier';
                salas.set(salaId, {
                    crupier: ws,
                    jugadores: {},
                    estado: 'esperando'
                });
                ws.send(JSON.stringify({
                    tipo: 'sala_creada',
                    salaId,
                    jugadorId
                }));
                console.log(`Sala creada: ${salaId}`);
                break;

            case 'unirse_sala':
                salaId = data.salaId;
                if (salas.has(salaId)) {
                    const sala = salas.get(salaId);
                    jugadorId = 'jugador' + Object.keys(sala.jugadores).length;
                    sala.jugadores[jugadorId] = ws;
                    
                    // Notificar a todos en la sala
                    sala.crupier.send(JSON.stringify({
                        tipo: 'jugador_unido',
                        jugadorId
                    }));
                    
                    ws.send(JSON.stringify({
                        tipo: 'unido_exitosamente',
                        jugadorId,
                        salaId
                    }));

                    if (Object.keys(sala.jugadores).length === 1) {
                        sala.estado = 'completa';
                        // Iniciar el juego
                        sala.crupier.send(JSON.stringify({ tipo: 'iniciar_juego' }));
                        sala.jugadores[jugadorId].send(JSON.stringify({ tipo: 'iniciar_juego' }));
                    }
                    console.log(`Jugador ${jugadorId} unido a la sala ${salaId}`);
                } else {
                    ws.send(JSON.stringify({
                        tipo: 'error',
                        mensaje: 'Sala no encontrada'
                    }));
                    console.log(`Intento fallido de unirse a sala: ${salaId}`);
                }
                break;

            case 'accion_jugador':
                if (salas.has(salaId)) {
                    const sala = salas.get(salaId);
                    console.log(`Acción de jugador en sala ${salaId}:`, data);
                    // Reenviar la acción al otro jugador
                    if (jugadorId === 'crupier') {
                        Object.values(sala.jugadores).forEach(jugador => {
                            jugador.send(JSON.stringify(data));
                        });
                    } else {
                        sala.crupier.send(JSON.stringify(data));
                    }
                }
                break;
        }
    });

    ws.on('close', () => {
        console.log(`Conexión cerrada para ${jugadorId} en sala ${salaId}`);
        if (salaId && salas.has(salaId)) {
            const sala = salas.get(salaId);
            if (jugadorId === 'crupier') {
                // Notificar a los jugadores que el crupier se desconectó
                Object.values(sala.jugadores).forEach(jugador => {
                    jugador.send(JSON.stringify({
                        tipo: 'crupier_desconectado'
                    }));
                });
                salas.delete(salaId);
            } else {
                // Eliminar al jugador de la sala
                delete sala.jugadores[jugadorId];
                sala.crupier.send(JSON.stringify({
                    tipo: 'jugador_desconectado',
                    jugadorId
                }));
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor ejecutándose en el puerto ${PORT}`);
});