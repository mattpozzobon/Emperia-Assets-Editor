# Emperia — Especificação reproduzível de Spell Icons

Versão: 1.0

Esta especificação se aplica somente a ícones de spells e skills. Não se aplica a símbolos de classe de 256×256 nem aos ícones de condições em pixel art.

## 1. Hierarquia de referência

Toda geração deve obedecer a esta ordem:

1. Contact sheet da classe-base contendo apenas spells finais de 32×32.
2. De três a seis PNGs finais aprovados da mesma classe-base.
3. Paleta da nova classe em uma imagem de swatches simples.
4. Esta especificação textual.

Nunca anexar um símbolo de classe de 256×256 como referência artística. Símbolos de classe possuem mais detalhe, contraste, nitidez e acabamento de emblema. Quando anexados, eles fazem a IA produzir ilustração, objeto 3D ou arte de card em vez de spell icon.

Mapeamento de estilo:

- Warrior, Juggernaut, Berserker e Guardian usam `warrior-style-anchor.png`.
- Mage, Arcane Mage, Lifebinder e outras classes mágicas suaves usam `mage-style-anchor.png`.
- Ranger, Archer, Marksman e Beastmaster usam `archer-style-anchor.png`.

A classe avançada altera somente a paleta e o assunto. Escala, suavidade, contraste, densidade e acabamento vêm da classe-base.

## 2. Formato obrigatório

- PNG RGB opaco, exatamente 32×32.
- Sem canal alpha e sem transparência.
- Fundo escuro preenchendo todos os 1024 pixels do arquivo.
- Sem borda, moldura, bevel, card, container ou cantos arredondados.
- Fonte gerada em quadrado 1:1.
- Redução da fonte para 32×32 em uma única operação Lanczos.
- Preview opcional de 320×320 usando nearest-neighbor.

## 3. Gramática visual

- Um único motivo principal.
- O motivo ocupa 60–70% da largura e altura.
- Margem escura mínima equivalente a 3 pixels no arquivo final.
- Máximo de três componentes visuais:
  1. símbolo principal;
  2. um arco, impacto ou suporte;
  3. até dois pequenos highlights.
- Objetos são tratados como glifos pintados, não como objetos realistas.
- Armas usam silhueta simples: lâmina, guarda curta e cabo. Sem textura de metal, rebites, gravação ou geometria complexa.
- Figuras humanas, quando indispensáveis, são pequenas silhuetas sem rosto, roupa ou anatomia detalhada.
- O fundo permanece visualmente quieto e mais escuro que o motivo.

## 4. Renderização

O resultado deve parecer pintado diretamente para uma tela de 32×32:

- gradientes curtos e comprimidos;
- bordas levemente borradas por antialiasing;
- brilho suave e localizado;
- contraste moderado;
- granulação discreta;
- pouquíssimo detalhe interno;
- aproximadamente 4–8 famílias de cor dominantes, sem exigir paleta indexada.

Mesmo quando a fonte for grande, ela deve permanecer simples e ligeiramente suave. A fonte não pode conter detalhes que só existem acima de 32×32.

## 5. Limites mensuráveis

O PNG final deve satisfazer:

- modo RGB, nunca RGBA;
- dimensões 32×32;
- luminância média dos quatro cantos inferior a 24/255;
- menos de 4% dos pixels com luminância acima de 235;
- nenhum elemento importante tocando a borda externa;
- pelo menos 70% dos pixels da borda externa pertencem ao fundo escuro;
- leitura inequívoca quando exibido em 32×32, sem zoom.

## 6. O que reprova automaticamente

- aparência 3D, fotorrealista, vector art ou card-game art;
- material detalhado, metal realista, reflexos especulares ou texturas finas;
- iluminação cinematográfica, bloom intenso ou explosão radial grande;
- assunto ocupando mais de 75% da tela;
- fundo transparente ou fundo preto vazio sem pintura até as bordas;
- mais de um símbolo principal;
- cenário, personagem completo, rosto ou anatomia detalhada;
- pixels quadrados grandes, estética 8-bit moderna ou voxel;
- resultado mais brilhante, limpo, nítido ou detalhado que os anchors;
- uso de símbolo de classe 256×256 como referência de renderização.

## 7. Paletas de classes avançadas

### Juggernaut

- fundo: `#0B0702`
- sombra: `#2B1204`
- laranja queimado: `#A83D05`
- âmbar: `#E56D09`
- highlight dourado: `#F6B94D`
- highlight máximo: `#FFF0C2`

Laranja identifica a classe. Não representa fogo.

### Lifebinder

- fundo: `#000A0A`
- sombra teal: `#003B32`
- esmeralda: `#00A86B`
- verde luminoso: `#20E394`
- mint: `#8FFFD0`
- highlight máximo: `#E7FFF7`
- ciano opcional: `#18A9D6`

Verde representa restauração e vínculo vital. Evitar folhas, árvores ou veneno, salvo quando a habilidade exigir.

## 8. Pipeline de aprovação

1. Definir a habilidade em uma frase de mecânica.
2. Converter a mecânica em um único símbolo simples.
3. Selecionar o anchor da classe-base.
4. Anexar a paleta da classe avançada separadamente.
5. Gerar uma fonte quadrada sem UI.
6. Reduzir diretamente para RGB 32×32 com Lanczos.
7. Comparar lado a lado, em escala idêntica, com seis ícones do anchor.
8. Rejeitar se a nova arte chamar mais atenção que o conjunto aprovado.
9. Salvar source, final, preview e atualizar o manifest somente após aprovação.

## 9. Regra de segurança de consistência

Quando houver dúvida entre fidelidade ao conceito e fidelidade ao conjunto, escolher fidelidade ao conjunto. Um ícone um pouco mais abstrato, mas coerente, é preferível a uma ilustração perfeita que pareça pertencer a outro jogo.
