# Mockups das páginas de projeto

Estas imagens preenchem a galeria que fica **entre o texto de introdução e o
bloco "Built with"**, em `project.html`. Hoje está vazia em todos os projetos —
é a única secção do site que existe em código mas nunca foi preenchida.

---

## Onde é que cada ficheiro vai

Uma pasta por projeto, com o **id** do projeto como nome:

```
assets/mockups/<id-do-projeto>/<nome>.webp
```

As pastas já estão todas criadas. Basta largar as imagens lá dentro.

Convenção de nomes: **minúsculas, com hífen, sem acentos e sem espaços**
(`ecra-inicial.webp`, não `Ecrã Inicial.webp`). Um servidor Linux trata
`Foto.webp` e `foto.webp` como ficheiros diferentes — a maior parte dos
alojamentos é Linux, e um nome com maiúscula que funciona no Windows dá 404 em
produção.

---

## Quantas imagens por projeto

**3 a 5.** É o intervalo em que a secção funciona:

- **1 ou 2** — a secção parece um acidente, não uma escolha
- **3 a 5** — dá ritmo, o visitante desce sem se cansar
- **6 ou mais** — deixa de ser leitura e passa a ser arquivo; as pessoas
  saltam, e o que era o teu melhor trabalho passa despercebido no meio

Se um projeto não tiver material para 3, é melhor **não pôr nenhuma** do que pôr
uma solta. A secção esconde-se sozinha quando está vazia.

---

## Larguras disponíveis

A galeria é uma grelha de 12 colunas e cada imagem declara a sua largura:

| Valor | Ocupa | Serve para |
|---|---|---|
| `full` *(padrão)* | 12 col — largura toda | a peça principal, uma composição larga |
| `half` | 6 col — metade | duas peças que se lêem em par |
| `third` | 4 col — um terço | três variações lado a lado (cores, estados, formatos) |

Abaixo de ~640px de largura tudo colapsa para largura total automaticamente.

**Ritmo que resulta bem com 4 imagens:**
`full` → `half` + `half` → `full`

Uma peça que abre, duas que comparam, uma que fecha.

---

## Especificações técnicas

- **Formato:** `.webp` (usa `.png` só quando precisares mesmo de transparência
  com qualidade — o webp também suporta transparência e pesa muito menos)
- **Largura:** 1600px para `full`, 1000px para `half` e `third`. Não precisa de
  mais: a grelha nunca passa dos ~1200px de largura útil.
- **Peso:** **abaixo de 300KB por imagem.** Isto importa — hoje há um
  `abrigo.png` de 3,6MB nos banners que devia ser webp, e o site já carrega
  95MB de vídeo. Cada MB extra aqui vai direto ao tempo de carregamento.
- **Fundo:** os mockups sem fundo (transparentes) resultam muito bem neste site,
  porque o fundo preto fica a fazer de tela. Se um mockup vier com fundo branco,
  recorta-o — a diferença é enorme.

---

## O que é preciso, projeto a projeto

Sugestões. Onde disser "sem fundo", é onde a transparência mais compensa.

### Web Interativa & 3D

**treasure-within** — *The Treasure Within*
1. `full` — um plano do oceano de estrelas com o galeão, o mais cinematográfico que tiveres
2. `half` — o Planeta da Coragem · 3. `half` — o Planeta da Felicidade
4. `full` — o ecrã final das reflexões partilhadas, ou um esquema da pipeline (voxel → Blender → Mixamo → .GLB)

**the-veldt** — *The Veldt*
1. `full` — o plano mais forte da experiência
2. `half` + 3. `half` — dois momentos distintos da narrativa
4. `full` — um detalhe técnico ou de interação

**soft-capture** — *Soft Capture*
1. `full` — a experiência a correr
2. `half` + 3. `half` — dois estados da captura

**modular-city** — *Modular City*
1. `full` — uma cidade gerada, plano aberto
2. `third` + 3. `third` + 4. `third` — três cidades diferentes, para mostrar a variação do gerador (é o argumento do projeto)

**audacia** — *Audácia*
1. `full` — a animação num frame forte
2. `half` + 3. `half` — dois momentos

### Marca & Identidade
*(É aqui que os mockups sem fundo mais valem a pena.)*

**quebra-jazz-identity** — *Quebra Jazz*
1. `full` — o cartaz principal
2. `half` — o saco *(sem fundo)* · 3. `half` — o livro *(sem fundo)*
4. `full` — a parede / aplicação no espaço
*(já tens estes 4 nos banners — aqui podem entrar em versão maior e sem fundo)*

**noytrall-mascot** — *NOY*
1. `full` — a folha de personagem (poses / expressões) *(sem fundo)*
2. `half` — o antes/depois a partir do logótipo · 3. `half` — a paleta
4. `full` — a NOY aplicada num contexto real

**kapout-identity** — *Kapout*
1. `full` — o logótipo e as suas variações *(sem fundo)*
2. `half` + 3. `half` — duas aplicações (papelaria, digital)
4. `full` — a paleta e a tipografia

**tabuadela** — *Tabuadela Terraplanagens*
1. `full` — o logótipo *(sem fundo)*
2. `third` — o contentor · 3. `third` — a mailer box *(sem fundo)* · 4. `third` — a impressão em papel
*(tens estes nos banners — aqui em maior)*

**cuidados-paliativos** — *IPO Coimbra*
1. `full` — a peça principal
2. `half` + 3. `half` — duas aplicações

### UI/UX & Produto
*(Aqui o que conta são ecrãs. Mockups de dispositivo sem fundo resultam muito bem.)*

**quebra-jazz-website**
1. `full` — a homepage num mockup de portátil *(sem fundo)*
2. `half` + 3. `half` — duas páginas interiores
4. `full` — o design system (cores, tipos, componentes)

**kapout-app**
1. `full` — três ecrãs em telemóvel, lado a lado *(sem fundo)*
2. `half` — o fluxo principal · 3. `half` — um detalhe de interação
4. `full` — o wireframe ou o mapa de navegação

**eateasy**
1. `full` — a plataforma em desktop *(sem fundo)*
2. `half` — a pesquisa/filtros · 3. `half` — a reserva
4. `full` — o esquema da base de dados relacional (é o que distingue este projeto)

**abrigo**
1. `full` — o protótipo em telemóvel *(sem fundo)*
2. `half` — o site do teste de usabilidade · 3. `half` — resultados do teste
4. `full` — o percurso do utilizador

### Motion & Audiovisual
*(Menos mockups, mais frames. 3 chegam.)*

**capicua-lenga**, **a-ultima-chama**, **o-sonho**, **silvestre**, **o-escaravelho**
1. `full` — o frame mais forte
2. `half` + 3. `half` — dois momentos que mostrem a evolução
*(no **o-escaravelho** e no **a-ultima-chama**, uma folha de storyboard ou dos
desenhos frame-a-frame valeria muito — é o processo artesanal que os distingue)*

---

## Depois de colocares as imagens

Diz-me e eu ligo-as aos dois ficheiros de idioma. Cada imagem fica assim:

```json
{ "src": "assets/mockups/kapout-app/ecras.webp",
  "alt": "Três ecrãs da app Kapout",
  "caption": "Fluxo principal",
  "span": "full" }
```

O `alt` descreve a imagem para quem usa leitor de ecrã e para o Google; a
`caption` é opcional e aparece por baixo em maiúsculas pequenas. Ambos precisam
de versão PT e EN — se me deres as legendas em português, eu traduzo.
