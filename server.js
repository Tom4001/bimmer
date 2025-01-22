const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const UserAgent = require('user-agents');

// Configurar o servidor
const app = express();
const PORT = 3000;

// Objeto para armazenar os modelos de cada marca
const supportedModels = {}; // { bmw: ['1-series', 'x5'], mini: [], ... }
const supportedGenerations = {}; // { bmw: { '1-series': ['1-series-m-coupe', 'x5'] }, ... }

// Middleware para servir arquivos estáticos (CSS, imagens, etc.)
app.use(express.static('public'));

// Função para buscar e modificar páginas
async function fetchAndModifyPage(url) {
  try {
    const userAgent = new UserAgent();

    const response = await axios.get(url, {
      headers: {
        'User-Agent': userAgent.toString(),
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
    });

    if (response.status !== 200) {
      throw new Error('Erro ao acessar o site.');
    }

    const $ = cheerio.load(response.data);

    // Modificar o texto da classe result-title positive
    $('.result-title.positive').text('O seu carro é suportado!');
    
    $('a.btn.btn-outline-primary.btn-lg.btn-cars').text('Opções disponíveis');
    
    $('.print.d-print-none.align-self-center').remove();

    // Remover todos os links que começam com href="/adapters/"
    $('a[href^="/adapters/"]').remove();

    // Outras modificações no HTML
    $('h1.display-4').text('BIMMER SERVICES');
    $('p.lead').text('Bem-Vindo, veja na lista abaixo se o seu carro é suportado!');
    $('.footer.fixed-bottom').remove();
    $('.row.justify-content-center.no-margin.no-padding').remove();
    $('#cookies-note').remove();

    // Alterar os links das folhas de estilo para garantir que estão corretos
    $('link[rel="stylesheet"]').each((i, link) => {
      const href = $(link).attr('href');
      if (href && !href.startsWith('http')) {
        $(link).attr('href', `https://bimmercode.app${href}`);
      }
    });

    return $.html();
  } catch (error) {
    console.error('Erro ao buscar a página:', error);
    throw error;
  }
}

// Rota principal para listar todas as marcas
app.get('/cars', async (req, res) => {
  try {
    const html = await fetchAndModifyPage('https://bimmercode.app/cars/');
    res.send(html); // Retorna o HTML modificado
  } catch (error) {
    res.status(500).send('Erro ao carregar a página principal.');
  }
});

// Rota para marcas específicas sob `/cars/:brand`
app.get('/cars/:brand', async (req, res) => {
  const brand = req.params.brand.toLowerCase();

  try {
    const url = `https://bimmercode.app/cars/${brand}/`;
    const html = await fetchAndModifyPage(url);

    // Coletar modelos dinamicamente
    const $ = cheerio.load(html);
    const models = [];
    $('a').each((i, link) => {
      const href = $(link).attr('href');
      if (href && href.startsWith(`/cars/${brand}/`)) {
        const model = href.replace(`/cars/${brand}/`, '').replace('/', '');
        models.push(model);
      }
    });

    // Atualizar supportedModels sem modificar o HTML da página
    supportedModels[brand] = [...new Set([...(supportedModels[brand] || []), ...models])];

    res.send(html); // Retorna o HTML modificado
  } catch (error) {
    res.status(500).send('Erro ao carregar a página da marca.');
  }
});

// Rota para modelos específicos de uma marca
app.get('/cars/:brand/:model', async (req, res) => {
  const { brand, model } = req.params;

  if (!supportedModels[brand]) {
    return res.status(404).send('Marca não suportada.');
  }

  // Coletar gerações ou sub-modelos dinamicamente para o modelo
  try {
    const url = `https://bimmercode.app/cars/${brand}/${model}`;
    const html = await fetchAndModifyPage(url);

    // Coletar gerações ou sub-modelos para o modelo específico
    const $ = cheerio.load(html);
    const generations = [];
    $('a').each((i, link) => {
      const href = $(link).attr('href');
      if (href && href.startsWith(`/cars/${brand}/${model}/`)) {
        const generation = href.replace(`/cars/${brand}/${model}/`, '').replace('/', '');
        generations.push(generation);
      }
    });

    // Atualizar supportedGenerations para este modelo
    supportedGenerations[brand] = supportedGenerations[brand] || {};
    supportedGenerations[brand][model] = [...new Set([...(supportedGenerations[brand][model] || []), ...generations])];

    res.send(html); // Retorna o HTML modificado
  } catch (error) {
    res.status(500).send('Erro ao carregar a página do modelo.');
  }
});

// Rota para gerações ou sub-modelos específicos de uma marca e modelo
app.get('/cars/:brand/:model/:generation', async (req, res) => {
  const { brand, model, generation } = req.params;

  if (!supportedModels[brand]) {
    return res.status(404).send('Marca não suportada.');
  }

  if (!supportedGenerations[brand] || !supportedGenerations[brand][model] || !supportedGenerations[brand][model].includes(generation)) {
    return res.status(404).send('Geração ou sub-modelo não suportado.');
  }

  try {
    const url = `https://bimmercode.app/cars/${brand}/${model}/${generation}`;
    const html = await fetchAndModifyPage(url);
    res.send(html); // Retorna o HTML modificado
  } catch (error) {
    res.status(500).send('Erro ao carregar a página da geração.');
  }
});

// Iniciar o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em https://localhost:${PORT}/cars`);
});
