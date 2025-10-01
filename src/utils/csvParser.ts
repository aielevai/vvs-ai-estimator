export interface ParsedProduct {
  short_description: string | null;
  long_description: string | null;
  supplier_item_id: string | null;
  vvs_number: string | null;
  ean_id: string | null;
  leadtime: number | null;
  is_on_stock: boolean;
  gross_price: number | null;
  net_price: number | null;
  price_quantity: number;
  price_unit: string;
  ordering_unit_1: string | null;
  ordering_factor_1: number | null;
  ordering_unit_2: string | null;
  ordering_factor_2: number | null;
  image_url: string | null;
  link: string | null;
  normalized_text: string;
}

// Fix encoding issues - convert common garbled Danish characters
const fixEncoding = (text: string): string => {
  const encodingMap: Record<string, string> = {
    'Ã¦': 'æ',
    'Ã˜': 'Ø',
    'Ã¸': 'ø',
    'Ã…': 'Å',
    'Ã¥': 'å',
    'Ã†': 'Æ',
    'Ã': 'Å', // Alternative encoding
    'Â°': '°',
    'Â½': '½',
    'Â¼': '¼',
    'Â¾': '¾',
    'â€"': '–',
    'â€œ': '"',
    'â€': '"',
    'â€™': "'",
    'â€˜': "'",
    '�': '', // Remove replacement characters
  };

  let fixed = text;
  for (const [garbled, correct] of Object.entries(encodingMap)) {
    fixed = fixed.replace(new RegExp(garbled, 'g'), correct);
  }
  return fixed;
};

export const fetchAndParseCSV = async (): Promise<ParsedProduct[]> => {
  console.log('Fetching CSV from /ahlsell-prices.csv...');
  
  const response = await fetch('/ahlsell-prices.csv');
  if (!response.ok) {
    throw new Error('Failed to fetch CSV file');
  }

  let csvText = await response.text();
  
  // Fix encoding issues
  csvText = fixEncoding(csvText);
  
  console.log('CSV loaded, parsing...');

  const lines = csvText.split('\n');
  const dataLines = lines.slice(1).filter(line => line.trim().length > 0);
  console.log(`Found ${dataLines.length} products to parse`);

  const products: ParsedProduct[] = [];

  for (const line of dataLines) {
    try {
      // Parse CSV line with proper handling of quotes and semicolons
      const fields: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ';' && !inQuotes) {
          fields.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      fields.push(current.trim());

      // Map fields according to CSV structure
      const [
        short_description,
        long_description,
        supplier_item_id,
        vvs_number,
        ean_id,
        , // customer_item_id - skipped
        , // tun_id - skipped  
        , // el_id - skipped
        , // unspsc - skipped
        leadtime,
        is_on_stock,
        gross_price,
        net_price,
        price_quantity,
        price_unit,
        , // price_currency - skipped
        ordering_unit_1,
        ordering_factor_1,
        ordering_unit_2,
        ordering_factor_2,
        image_url,
        link
      ] = fields;

      // Clean and convert data
      const product: ParsedProduct = {
        short_description: short_description?.replace(/"/g, '') || null,
        long_description: long_description?.replace(/"/g, '') || null,
        supplier_item_id: supplier_item_id || null,
        vvs_number: vvs_number || null,
        ean_id: ean_id || null,
        leadtime: leadtime ? parseInt(leadtime) : null,
        is_on_stock: is_on_stock === '"true"' || is_on_stock === 'true',
        gross_price: gross_price ? parseFloat(gross_price.replace(',', '.')) : null,
        net_price: net_price ? parseFloat(net_price.replace(',', '.')) : null,
        price_quantity: price_quantity ? parseFloat(price_quantity.replace(',', '.')) : 1,
        price_unit: price_unit?.replace(/"/g, '') || 'STK',
        ordering_unit_1: ordering_unit_1?.replace(/"/g, '') || null,
        ordering_factor_1: ordering_factor_1 ? parseFloat(ordering_factor_1.replace(',', '.')) : null,
        ordering_unit_2: ordering_unit_2?.replace(/"/g, '') || null,
        ordering_factor_2: ordering_factor_2 ? parseFloat(ordering_factor_2.replace(',', '.')) : null,
        image_url: image_url?.replace(/"/g, '') || null,
        link: link?.replace(/"/g, '') || null,
        normalized_text: ''
      };

      // Create normalized_text for search
      product.normalized_text = [
        product.short_description,
        product.long_description,
        product.vvs_number,
        product.supplier_item_id
      ].filter(Boolean).join(' ').toLowerCase();

      products.push(product);
    } catch (lineError) {
      console.error('Error parsing line:', lineError);
    }
  }

  console.log(`Successfully parsed ${products.length} products`);
  return products;
};

export const chunkArray = <T>(array: T[], chunkSize: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
};
