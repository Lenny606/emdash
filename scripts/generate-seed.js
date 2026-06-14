import fs from 'fs';
import path from 'path';

const galleriesJsonPath = path.resolve('galerie_praha.json');
const seedJsonPath = path.resolve('seed/seed.json');

function slugify(text) {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/\-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function run() {
  if (!fs.existsSync(galleriesJsonPath)) {
    console.error(`Source file ${galleriesJsonPath} does not exist.`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(galleriesJsonPath, 'utf8');
  const sourceData = JSON.parse(rawData);

  const galleryCategoryTermsMap = new Map();
  const districtTermsMap = new Map();
  const galleriesContent = [];

  sourceData.categories.forEach((cat) => {
    const catName = cat.category;
    const catSlug = slugify(catName);
    galleryCategoryTermsMap.set(catSlug, { slug: catSlug, label: catName });

    cat.galleries.forEach((gal) => {
      const slug = slugify(gal.name);
      
      // Handle district term
      const distName = gal.district ? gal.district.trim() : '';
      let distSlug = '';
      if (distName) {
        distSlug = slugify(distName);
        if (!districtTermsMap.has(distSlug)) {
          districtTermsMap.set(distSlug, { slug: distSlug, label: distName });
        }
      }

      // Map to gallery schema
      galleriesContent.push({
        id: slug,
        slug: slug,
        status: 'published',
        data: {
          title: gal.name,
          address: gal.address || '',
          web: gal.web || '',
          note: gal.note || ''
        },
        taxonomies: {
          gallery_category: [catSlug],
          ...(distSlug ? { district: [distSlug] } : {})
        }
      });
    });
  });

  const seedObj = {
    $schema: 'https://emdashcms.com/seed.schema.json',
    version: '1',
    meta: {
      name: 'Prague Galleries',
      description: 'Overview of galleries and art museums in Prague',
      author: 'Antigravity developer'
    },
    settings: {
      title: 'Artis Praga',
      tagline: 'Přehled pražských galeriích a uměleckých institucí'
    },
    collections: [
      {
        slug: 'pages',
        label: 'Stránky',
        labelSingular: 'Stránka',
        supports: ['drafts', 'revisions', 'search'],
        fields: [
          {
            slug: 'title',
            label: 'Titulek',
            type: 'string',
            required: true,
            searchable: true
          },
          {
            slug: 'content',
            label: 'Obsah',
            type: 'portableText',
            searchable: true
          }
        ]
      },
      {
        slug: 'galleries',
        label: 'Galerie',
        labelSingular: 'Galerie',
        supports: ['drafts', 'revisions', 'search', 'seo'],
        fields: [
          {
            slug: 'title',
            label: 'Název',
            type: 'string',
            required: true,
            searchable: true
          },
          {
            slug: 'address',
            label: 'Adresa',
            type: 'string',
            required: true,
            searchable: true
          },
          {
            slug: 'web',
            label: 'Webové stránky',
            type: 'string'
          },
          {
            slug: 'note',
            label: 'Poznámka',
            type: 'text',
            searchable: true
          }
        ]
      }
    ],
    taxonomies: [
      {
        name: 'gallery_category',
        label: 'Kategorie',
        labelSingular: 'Kategorie',
        hierarchical: true,
        collections: ['galleries'],
        terms: Array.from(galleryCategoryTermsMap.values())
      },
      {
        name: 'tag',
        label: 'Tagy',
        labelSingular: 'Tag',
        hierarchical: false,
        collections: ['galleries'],
        terms: []
      },
      {
        name: 'district',
        label: 'Městské části',
        labelSingular: 'Městská část',
        hierarchical: false,
        collections: ['galleries'],
        terms: Array.from(districtTermsMap.values()).sort((a, b) => a.label.localeCompare(b.label, 'cs'))
      }
    ],
    menus: [
      {
        name: 'primary',
        label: 'Hlavní navigace',
        items: [
          { type: 'custom', label: 'Domů', url: '/' },
          { type: 'custom', label: 'Kategorie', url: '/kategorie' },
          { type: 'custom', label: 'Městské části', url: '/obvod' },
          { type: 'custom', label: 'O projektu', url: '/about' }
        ]
      }
    ],
    widgetAreas: [
      {
        name: 'sidebar',
        label: 'Sidebar',
        description: 'Sidebar widget area',
        widgets: [
          { type: 'component', componentId: 'core:search', title: 'Hledat' }
        ]
      }
    ],
    content: {
      pages: [
        {
          id: 'about',
          slug: 'about',
          status: 'published',
          data: {
            title: 'O projektu Artis Praga',
            content: [
              {
                _type: 'block',
                style: 'normal',
                children: [
                  {
                    _type: 'span',
                    text: 'Tento web slouží jako přehledný průvodce po pražských galeriích, muzeích umění a nezávislých uměleckých prostorech.',
                    _key: 'about-intro'
                  }
                ],
                _key: 'about-block-1'
              }
            ]
          }
        }
      ],
      galleries: galleriesContent
    }
  };

  const seedDir = path.dirname(seedJsonPath);
  if (!fs.existsSync(seedDir)) {
    fs.mkdirSync(seedDir, { recursive: true });
  }

  fs.writeFileSync(seedJsonPath, JSON.stringify(seedObj, null, 2), 'utf8');
  console.log(`Successfully generated seed at ${seedJsonPath}`);
}

run();
