// Mini juego: Adivina el número
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Generar un número aleatorio entre 1 y 100
const numeroSecreto = Math.floor(Math.random() * 100) + 1;
let intentos = 0;
const maxIntentos = 10;

console.log('¡Bienvenido a Adivina el Número!');
console.log(`Tienes ${maxIntentos} intentos para adivinar un número entre 1 y 100.`);

function pedirNumero() {
    rl.question('Ingresa tu número: ', (respuesta) => {
        const numero = parseInt(respuesta);
        intentos++;

        if (isNaN(numero)) {
            console.log('Por favor, ingresa un número válido.');
        } else if (numero === numeroSecreto) {
            console.log(`¡Felicitaciones! ¡Adivinaste el número en ${intentos} intentos!`);
            rl.close();
        } else if (intentos >= maxIntentos) {
            console.log(`¡Game Over! El número era ${numeroSecreto}`);
            rl.close();
        } else {
            const pista = numero < numeroSecreto ? 'mayor' : 'menor';
            console.log(`El número es ${pista} que ${numero}`);
            console.log(`Te quedan ${maxIntentos - intentos} intentos`);
            pedirNumero();
        }
    });
}

pedirNumero();