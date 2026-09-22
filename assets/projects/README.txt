ASSETS POR PROJETO
==================

Esta pasta guarda o material rico de cada caso de estudo. Um projeto, uma
pasta, sempre com o mesmo esqueleto:

    assets/projects/<id-do-projeto>/
        models/     .glb prontos para a web
        renders/    imagens finais, renders, capturas do produto acabado
        process/    o caminho ate la: esbocos, viewports do Blender,
                    MagicaVoxel, wireframes de UI, mapas de navegacao
        video/      clipes curtos, ja em .webm
        reference/  material que NAO e teu: fotogramas de filmes, moodboards,
                    wallpapers. Separado do resto de proposito, ver abaixo

O <id-do-projeto> e EXATAMENTE o campo "id" do data/projects.pt.json. Nao e
o titulo, nao e uma abreviatura. Se o id e "treasure-within", a pasta chama-se
"treasure-within". Isto permite que o codigo construa o caminho a partir dos
dados sem uma tabela de correspondencia a meio.


PORQUE E QUE ISTO EXISTE, TENDO JA assets/banners E assets/mockups
------------------------------------------------------------------
As duas pastas antigas servem dois campos concretos e antigos do JSON: o
banner do cartao na galeria e a galeria de mockups da pagina do projeto. Ambas
continuam a funcionar e nada foi movido.

O que elas nao conseguem servir e um caso de estudo a serio, onde o mesmo
projeto traz modelos 3D, renders, provas de processo e video, cada um com um
papel diferente na pagina. Deitar tudo para dentro de "mockups" faria dessa
pasta um saco.

A regra e simples: material NOVO de caso de estudo entra aqui. O que ja existe
fica onde esta ate a sua pagina ser refeita, e nessa altura muda-se de uma vez.


reference/ E UMA PASTA A PARTE E TEM DE CONTINUAR A SER
---------------------------------------------------
renders/ e process/ sao trabalho teu. reference/ nao e: e o filme de onde o
projeto partiu, sao moodboards, sao wallpapers de terceiros. Misturar as duas
coisas na mesma pasta e como um dia acaba por aparecer um fotograma da Disney
num sitio onde toda a gente assume que a autoria e tua.

A separacao e estrutural e nao uma convencao de nomes por uma razao simples:
daqui a um ano ninguem se lembra de qual e qual, mas a pasta continua a saber.

Tudo o que esta em reference/ tem de aparecer na pagina com credito. No
Treasure Within isso e o campo "credit" do carrossel, em data/projects.*.json,
que imprime uma linha por baixo das imagens.


NOMES
-----
Em ingles, minusculas, hifens, sem acentos. O nome descreve o que a coisa E,
nao como se chamava no ficheiro de origem:

    barco.glb            ->  ship.glb
    barcoantigo.glb      ->  ship-first.glb
    tripulante_final.glb ->  jim.glb
    Tripulante_Ben.glb   ->  ben.glb

Vale a pena o trabalho: daqui a um ano ninguem se lembra do que era
"tripulante_final", e "jim.glb" nao precisa de ser explicado.


PESO
----
Nada aqui e carregado com a pagina. Os modelos descem quando o visitante pede,
e o anterior e destruido antes de o seguinte comecar. Ainda assim:

    ate 1.5 MB     um modelo que valha a pena
    ate 400 KB     por render
    ate 2 MB       por clipe de video

O four-emotions.webm passa este orcamento: sao 3.9 MB para 42 segundos a
1280x720. Fica assim de proposito e nao por descuido. O <video> nasce com
preload="none" e so o cam-feeds.js o manda tocar quando entra no ecra, por isso
sao 0 bytes para quem nunca chega aquele capitulo. Se um dia for preciso baixar,
o corte esta na duracao e nao na qualidade: 15 segundos dao ~1.4 MB.

Os planetas do Treasure Within ficaram de fora por isto mesmo: entre 1.6 e
3.9 MB cada, 11.4 MB pelos quatro. Estao no projeto original se um dia forem
precisos.
