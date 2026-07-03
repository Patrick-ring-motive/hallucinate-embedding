import {
  env
} from "cloudflare:workers";

const getModel = async () => {
  try {
    const res = await fetch('https://best-model.api-cloud-flare.workers.dev/');
    const data = await res.json();
    return data.model;
  } catch (e) {
    return String(e);
  }
};

const getVec = async (model, text) => {
  const sys = "you behave like and embedding model and return a vector representing the semantic value of provided text. Output exactly 128 floats, range -1 to 1, comma-separated, no words, no explanation. Represent semantic content of input as numbers deterministically.";
  try {
    const resp = await env.AI.run(model, {
      messages: [{
          role: "system",
          content: sys
        },
        {
          role: "user",
          content: text
        }
      ],
      temperature: 0,
      seed: 42
    });
    return resp.response.trim();
  } catch (e) {
    try {
      const resp = await env.AI.run(model, {
        messages: [{
            role: "system",
            content: sys
          },
          {
            role: "user",
            content: [...new Set(text.split(/\s+/))].join(' ')
          }
        ],
        temperature: 0,
        seed: 42
      });
      return resp.response.trim();
    } catch (e2) {
      return String(e2);
    }
  }
};

let model;
async function fakeEmbed(text) {
  if (!model) {
    model = getModel();
  }
  model = await model;
  const raw = await getVec(model, text);
  const vec = raw.split(",").map(Number);
  const arr = Array(128).fill(0).map((_, i) => vec[i] || 0);
  return arr;
}

const estTokens = (s) => Math.ceil(s.length / 4);

function errResp(msg, status) {
  return new Response(JSON.stringify({
    error: {
      message: msg,
      type: "invalid_request_error"
    }
  }), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

function buildResult(inputs, embeddings, modelName) {
  const totalTokens = inputs.reduce((sum, t) => sum + estTokens(String(t)), 0);
  return {
    object: "list",
    data: embeddings.map((embedding, index) => ({
      object: "embedding",
      index,
      embedding
    })),
    model: modelName || "fake-embed",
    usage: {
      prompt_tokens: totalTokens,
      total_tokens: totalTokens
    }
  };
}

export default {
  async fetch(request) {
    let inputs, reqModel;

    if (request.method === 'GET') {
      const url = new URL(request.url);
      const text = url.searchParams.get('input') ?? url.searchParams.get('text');
      reqModel = url.searchParams.get('model');
      if (!text) return errResp("'input' query param required", 400);
      inputs = [text];
    } else if (request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return errResp("Invalid JSON body", 400);
      }
      const {
        input,
        model: m
      } = body;
      reqModel = m;
      if (!input || (Array.isArray(input) && input.length === 0)) {
        return errResp("'input' is required", 400);
      }
      inputs = Array.isArray(input) ? input : [input];
    } else {
      return errResp("Method not allowed, use GET or POST", 405);
    }

    const embeddings = await Promise.all(inputs.map(text => fakeEmbed(String(text))));
    const result = buildResult(inputs, embeddings, reqModel);

    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  },
};
