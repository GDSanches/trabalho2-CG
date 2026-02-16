import { BoxColor } from './box.js';

// Hierarquia de cores: RED > GREEN > BLUE
// Regra: caixa de cor "menor ou igual" pode ficar em cima de cor "maior ou igual"
// Mesma cor: OK
// Azul sobre Verde: OK, Azul sobre Vermelha: OK
// Verde sobre Vermelha: OK
// Verde sobre Azul: NÃO, Vermelha sobre Azul: NÃO, Vermelha sobre Verde: NÃO

const COLOR_WEIGHT = {
    [BoxColor.RED]: 3,
    [BoxColor.GREEN]: 2,
    [BoxColor.BLUE]: 1
};

/**
 * Verifica se newBox pode ser empilhada sobre targetBox.
 * Regra: a caixa de cima deve ter peso de cor <= à de baixo.
 */
export function canStack(newBox, targetBox) {
    if (!targetBox) return true; // Chão/palete: sempre permitido
    return COLOR_WEIGHT[newBox.colorCategory] <= COLOR_WEIGHT[targetBox.colorCategory];
}

/**
 * Retorna mensagem de erro quando empilhamento não é permitido.
 */
export function getStackError(newBox, targetBox) {
    if (canStack(newBox, targetBox)) return null;

    const newName = newBox.getColorName();
    const targetName = targetBox.getColorName();
    return `Caixa ${newName} não pode ser empilhada sobre caixa ${targetName}!`;
}

/**
 * Calcula a posição Y para empilhar newBox sobre uma pilha de caixas.
 * baseY é a posição Y da base da pilha (topo do palete/chão).
 * stackedBoxes é a lista de caixas já empilhadas na coluna.
 */
export function getStackY(newBox, stackedBoxes, baseY = 0) {
    let y = baseY;
    for (const box of stackedBoxes) {
        y += box.height;
    }
    // O centro da nova caixa fica na metade da sua altura acima do topo da pilha
    return y + newBox.height / 2;
}

/**
 * Encontra a caixa do topo de uma pilha (a última empilhada).
 */
export function getTopBox(stackedBoxes) {
    if (stackedBoxes.length === 0) return null;
    return stackedBoxes[stackedBoxes.length - 1];
}
