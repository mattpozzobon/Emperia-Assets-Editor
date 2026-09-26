# Emperia — Guia Único de Criação de Ícones

Este é o documento canônico para criar todos os ícones de Emperia. Ele cobre três famílias que não devem ser misturadas:

1. símbolos de classe em 256×256;
2. spells e skills em 32×32 com pintura raster suave;
3. condições e status em 32×32 com pixel art rígida.

Quando houver conflito entre um documento antigo e este guia, usar este guia.

---

# 1. Regras universais

- Formato PNG quadrado.
- Fundo preenchido até todas as bordas; nenhum ícone usa transparência.
- Arquivo final em modo RGB, nunca RGBA.
- Sem borda externa, moldura, bevel, card, container ou cantos arredondados.
- Sem texto, letras, números, logos ou watermark, exceto quando uma condição específica exigir texto funcional aprovado.
- Um único conceito visual imediatamente reconhecível.
- Todas as partes importantes ficam dentro da tela, com margem escura.
- O ícone deve comunicar a mecânica, não apenas decorar.
- Não usar cenário completo, retrato detalhado, personagem realista ou composição congestionada.
- Não usar fotorrealismo, objeto 3D, arte de card game, acabamento de jogo mobile moderno ou vector art limpa.

## Regra de referências

Cada tipo de ícone usa referências do mesmo tipo:

- Símbolo de classe usa somente outros símbolos de classe 256×256.
- Spell usa somente spells finais 32×32 da classe-base correta.
- Condição/status usa somente condições/status finais 32×32.

Nunca usar um símbolo de classe 256×256 como referência de renderização para uma spell. O símbolo pode fornecer a paleta da classe, mas seu acabamento é detalhado demais para spells.

Nunca usar condições em pixel art como referência para spells pintadas, nem spells pintadas como referência para condições.

---

# 2. Símbolos de classe

## Formato

- PNG RGB opaco.
- Exatamente 256×256.
- Proporção 1:1.
- Fundo escuro preenchendo todo o arquivo.
- Sem moldura.
- Símbolo ocupa aproximadamente 75–80% da composição.
- Todas as partes importantes devem caber em uma área segura para recorte diamond.
- Os quatro cantos ficam visualmente vazios e escuros.

## Direção artística

- Emblema clássico de MMORPG.
- Pintura suave, brilho controlado e silhueta robusta.
- Mais acabamento e detalhe que uma spell de 32×32, mas sem virar ilustração de card.
- Um símbolo principal ou uma combinação extremamente simples de dois símbolos.
- Fundo discreto com aura difusa; sem cenário.
- Sem texto, brasão externo, placa, banner ou moldura ornamental.

## Símbolos-base

### Mage

- Um glifo mágico: estrela luminosa de quatro pontas, círculo interno, órbita incompleta e dois pontos orbitais.
- Azul-marinho, azul real, ciano elétrico e núcleo branco-azulado.

### Arcane Mage

- Dois glifos compactos iguais ao Mage, com leve deslocamento diagonal.
- Mesma paleta azul do Mage.

### Warrior

- Uma espada curta e larga, quase vertical.
- Fundo marrom/oliva quase preto, ocre, dourado e creme.
- Sem fogo, sangue ou aura sagrada.

### Ranger

- Arco de caça vertical com uma flecha encaixada horizontalmente.
- Verde-floresta, oliva, musgo e amarelo-esverdeado.
- Sem folhas, vinhas ou partículas mágicas.

## Classes avançadas conhecidas

- Berserker: duas espadas largas cruzadas; carmesim e laranja.
- Guardian: espada diagonal diante de escudo canônico; aço frio e turquesa.
- Spellblade: espada dourada diante de um glifo azul.
- Battle Mage: glifo azul sobre escudo canônico, sem espada.
- Summoner: criatura espectral emergindo de portal violeta.
- Ninja: shuriken diante de uma kunai; aço escuro e magenta discreto.
- Juggernaut: espada colossal de duas mãos; bronze, âmbar e laranja queimado.
- Arcane Archer: arco verde diante do glifo azul do Mage.
- Marksman: besta medieval com um virote; oliva, madeira e bronze.
- Archer: arco longo refinado com uma flecha longa.
- Beastmaster: arco envolvendo cabeça espectral de lobo.
- Lifebinder: duas fitas de energia entrelaçadas formando um nó vertical ao redor de núcleo vital; esmeralda, mint e ciano.

## Prompt-base para símbolo de classe

```text
Use case: stylized-concept
Asset type: one production 256x256 class-node symbol for Emperia.

Input images: approved 256x256 class symbols only. Match their soft-painted MMORPG finish, centered scale, dark edge-to-edge background, controlled glow, silhouette strength and diamond-safe composition.

Primary request: create the class symbol for "{CLASS_NAME}".
Subject: {ONE_SIMPLE_EMBLEM}.

Composition: one centered emblem occupying 75–80% of the square. Keep every important part inside the safe area for a diamond crop. Leave all four corners dark and empty.

Palette: {CLASS_PALETTE}.

Constraints: opaque RGB background; no transparency, border, frame, card, text, letters, numbers, logo, watermark, detailed character, scenery, photorealism, glossy 3D object, excessive particles or excessive bloom.
```

---

# 3. Spells e skills

## Formato

- PNG RGB opaco.
- Exatamente 32×32.
- Fundo escuro preenchendo os 1024 pixels.
- Sem borda ou transparência.
- Um símbolo principal ocupando 60–70% da largura e altura.
- Margem escura mínima equivalente a 3 pixels finais.
- Reduzir a fonte para 32×32 em uma única operação Lanczos.
- Preview opcional em 320×320 usando nearest-neighbor.

## Estilo

- Raster pintado à mão para uma tela pequena.
- MMORPG de PC do começo dos anos 2000.
- Gradientes curtos e comprimidos.
- Bordas suavemente antialiased e levemente borradas.
- Granulação discreta.
- Contraste moderado.
- Pouquíssimo detalhe interno.
- Brilho localizado, nunca cinematográfico.
- Aproximadamente 4–8 famílias de cores dominantes; isto não é um limite rígido de cores do PNG.

Mesmo quando a fonte for grande, ela deve permanecer simples e ligeiramente suave. Não adicionar detalhe que desapareça após a redução.

## Gramática visual

Cada spell possui no máximo:

1. um símbolo principal;
2. um arco, impacto, círculo ou suporte;
3. até dois pequenos highlights.

Armas são glifos pintados, não objetos realistas. Usar lâmina simples, guarda curta e cabo. Sem textura de metal, gravações, rebites ou reflexos especulares.

Personagens, quando inevitáveis, são pequenas silhuetas sem rosto, roupa ou anatomia detalhada.

## Famílias de estilo

### Warrior e derivados

Referência: spells aprovadas de Warrior, especialmente Double Slash, Battle Cry, Ground Slam, Execute, Cleave e Blade Prison.

- Fundo marrom/oliva quase preto.
- Símbolos dourados simples, sombras escuras e highlights creme.
- Silhuetas humanas pequenas e pretas quando necessárias.
- Habilidades físicas não recebem elementos, runas ou magia.

Derivados:

- Juggernaut mantém o acabamento Warrior e troca somente a paleta para laranja queimado, âmbar e bronze.
- Berserker pode usar carmesim e laranja, preservando a mesma simplicidade.
- Guardian pode usar aço e turquesa, preservando a mesma densidade.

Paleta Juggernaut:

- fundo `#0B0702`
- sombra `#2B1204`
- laranja queimado `#A83D05`
- âmbar `#E56D09`
- highlight dourado `#F6B94D`
- highlight máximo `#FFF0C2`

Laranja é cor de classe, não fogo.

### Mage e derivados

Referência: Arcane Bolt, Mana Shield, Mana Beam, Teleport, Magic Wall, Arcane Chains e Mana Drain.

- Fundo azul-marinho profundo.
- Azul saturado, ciano elétrico, ciano pálido e branco-azulado.
- Gradientes suaves e luminosos.
- Acabamento airbrushed ou vítreo.
- Bloom contido e bordas suavemente borradas.
- Não copiar o acabamento fosco do Archer.

Exceções cromáticas são permitidas quando fazem parte do conceito canônico, como Light ou Arcane Haste.

Derivados:

- Lifebinder mantém a suavidade do Mage e troca a paleta para teal, esmeralda e mint.

Paleta Lifebinder:

- fundo `#000A0A`
- sombra teal `#003B32`
- esmeralda `#00A86B`
- verde luminoso `#20E394`
- mint `#8FFFD0`
- highlight máximo `#E7FFF7`
- ciano opcional `#18A9D6`

Verde representa cura e vínculo vital; não adicionar automaticamente folhas, árvores ou veneno.

### Archer e derivados

Referência: spells aprovadas do Archer.

- Fundo verde-floresta quase preto.
- Musgo, oliva, amarelo-esverdeado e off-white.
- Acabamento fosco, suave e discretamente granulado.
- Ações físicas, armas, armadilhas, treinamento, rastreamento e animais treinados.
- Sem runas, aura, magia elemental ou partículas sobrenaturais.

## Limites mensuráveis

- Modo RGB, nunca RGBA.
- 32×32.
- Luminância dos quatro cantos abaixo de 24/255.
- Menos de 4% dos pixels acima de luminância 235.
- Pelo menos 70% da borda externa permanece escura.
- Nenhum elemento importante toca a borda.
- O ícone deve ser reconhecível sem zoom.

## Reprovação automática

- objeto realista ou 3D;
- metal detalhado, reflexos, material ou textura fina;
- iluminação cinematográfica ou bloom grande;
- personagem detalhado;
- mais de um motivo principal;
- fundo transparente;
- assunto maior que 75%;
- cenário completo;
- pixel art moderna com quadrados grandes;
- ícone mais brilhante, limpo, nítido ou detalhado que as referências.

## Prompt-base para spell

```text
Use case: stylized-concept
Asset type: one production 32x32-style spell icon for Emperia.

Input images:
Image 1 is the strict class-base style reference. Copy its softness, low contrast, dark-background treatment, icon scale, low detail density, restrained glow and native-32x32 readability.
Image 2 is a palette reference only. Use its colors, but do not copy its rendering detail.
Optional Images 3–5 are approved final 32x32 spells from the same class-base.

Primary request: create "{SKILL_NAME}" for {CLASS_NAME}.
Gameplay meaning: {ONE_SENTENCE_MECHANIC}.
Subject: show only {ONE_SIMPLE_MOTIF}, one supporting {ARC_OR_IMPACT_OR_SUPPORT}, and at most two tiny highlights.

Exact style: classic small MMORPG raster icon painted directly for native 32x32. Soft compressed gradients, slightly blurry antialiased edges, muted values, moderate contrast, subtle grain, restrained localized glow, chunky simple silhouette and extremely low internal detail. The large source must intentionally remain simple and soft.

Composition: one centered symbol occupying 60–70% of the square, with dark padding equivalent to at least 3 final pixels. Complete subject fully inside the canvas. Opaque edge-to-edge dark background.

Palette: {CLASS_PALETTE}.

Hard invariants: opaque RGB PNG, no alpha or transparency, no border, frame, bevel, rounded card, UI, text, logo or watermark.

Avoid: realistic object, detailed metal, material texture, 3D render, vector logo, glossy mobile-game art, card-game illustration, cinematic lighting, high contrast, excessive bloom, detailed character, full scene, large square pixels, or an image brighter, sharper, cleaner or more detailed than the supplied 32x32 references.
```

## Instrução de correção de estilo

```text
The result does not match the supplied 32x32 reference. Simplify rather than embellish. Remove material detail, realistic lighting, sharp edges, extra particles and large bloom. Reduce the subject to one chunky emblem, lower contrast and brightness, increase dark padding, and match the reference's softness and visual density exactly. Preserve only the gameplay motif and class palette.
```

---

# 4. Condições e status

Condições e status compartilham o mesmo sistema visual. O tipo informa a cor do fundo e a função dentro do jogo.

## Formato

- PNG RGB opaco.
- Exatamente 32×32.
- Pixel art clássica de RPG 16-bit.
- Clusters de pixels grandes, limpos e hard-edged.
- Um símbolo central ocupando 75–80%.
- Contorno forte quase preto.
- Máximo de oito cores exatas, incluindo o fundo.
- Fundo de uma única cor sólida.
- Preview ampliado somente com nearest-neighbor.

## Proibições

- Sem antialiasing.
- Sem blur.
- Sem gradientes.
- Sem dithering.
- Sem texture noise.
- Sem glow suave.
- Sem transparência.
- Sem moldura.
- Sem detalhes menores que um pixel final.

## Categorias de fundo

- Negativo (`-`): burgundy profundo `#350812`.
- Positivo (`+`): teal profundo `#07302B`.
- Neutro ou sistema (`N`): slate blue escuro `#121F36`.
- Zona (`Z`): plum escuro `#260D34`.

As cores do motivo podem variar para comunicar veneno, fogo, gelo, cura, mana ou equipamento, mas o arquivo completo continua limitado a oito cores.

## Semântica

- Negativo: perda, controle, dano, restrição ou penalidade.
- Positivo: cura, proteção, regeneração, fortalecimento ou mobilidade.
- Neutro/sistema: regras temporárias, cooldowns ou estados técnicos.
- Zona: propriedades do local, PvP, comércio, casa ou restrições.

O símbolo deve diferenciar condições parecidas. Exemplo: Rooted usa raízes; Tethered usa algema, corrente tensionada e estaca. Não reutilizar o mesmo motivo com apenas outra cor.

## Texto em condições

Texto é proibido por padrão. Exceções funcionais, como XP, porcentagem ou abreviação aprovada, são desenhadas diretamente na grade final com alfabeto bitmap. Nunca confiar em tipografia gerada por IA.

## Prompt-base para condição ou status

```text
Use case: stylized-concept.
Asset type: source design for an exact 32x32 Emperia condition/status icon.

Strict references: match the supplied approved condition icons in simplicity, chunky pixel scale, bold near-black outline, flat color treatment, spacing and visual weight.

Create "{NAME}", a {NEGATIVE|POSITIVE|NEUTRAL|ZONE} condition/status.
Subject: {ONE_SIMPLE_MOTIF}.
Background: solid {CATEGORY_BACKGROUND_HEX} filling every pixel.

Use simple classic 16-bit RPG pixel art with large clean hard-edged clusters. One centered cohesive symbol occupies 75–80% of the square.

Maximum eight flat colors total including the background: {EXACT_PALETTE}.

No visible grid, border, frame, text, letters, numbers, antialiasing, blur, gradients, dithering, texture noise, extra objects or more than eight colors. Show only the finished icon enlarged with nearest-neighbor presentation.

After generation, rebuild or reduce the design on the exact 32x32 grid, preserve the solid category background, and remap the foreground to at most seven additional colors without dithering.
```

---

# 5. Pipeline de arquivos

## Spells e condições geradas a partir de fonte

```text
NN-name-source.png     fonte quadrada em alta resolução
NN-name.png            final RGB 32×32
NN-name-preview.png    preview 320×320 nearest-neighbor
```

## Símbolos de classe

```text
class-name-symbol-source.png
class-name-symbol.png          final RGB 256×256
```

## Versões

- Variante descartada ou anterior: `-v1`, `-v2`, etc.
- O arquivo sem sufixo representa a versão aprovada.
- Não adicionar uma variante ao manifest antes da aprovação.
- Nunca sobrescrever um asset aprovado sem preservar a versão anterior.

---

# 6. Checklist final

## Símbolo de classe

- [ ] 256×256 RGB opaco.
- [ ] Fundo até as bordas.
- [ ] Um emblema central.
- [ ] Ocupação de 75–80%.
- [ ] Cantos vazios para diamond crop.
- [ ] Sem texto, moldura ou cenário.

## Spell ou skill

- [ ] 32×32 RGB opaco.
- [ ] Referências somente da classe-base correta.
- [ ] Símbolo de classe usado somente para paleta.
- [ ] Um motivo central de 60–70%.
- [ ] Pelo menos 3 pixels de margem visual.
- [ ] Pouquíssimo detalhe interno.
- [ ] Glow e brilho comparáveis ao conjunto aprovado.
- [ ] Legível no tamanho real.
- [ ] Não parece 3D, card art ou ilustração moderna.

## Condição ou status

- [ ] 32×32 RGB opaco.
- [ ] Fundo sólido correto para a categoria.
- [ ] No máximo oito cores.
- [ ] Sem antialiasing, blur, gradiente ou dithering.
- [ ] Símbolo ocupa 75–80%.
- [ ] Contorno quase preto.
- [ ] Preview nearest-neighbor.

---

# 7. Princípio final

Quando houver conflito entre comunicar o conceito com detalhe e manter consistência com o conjunto, escolher consistência. Um símbolo mais abstrato que parece pertencer ao jogo é melhor que uma ilustração perfeita pertencente a outro estilo.
