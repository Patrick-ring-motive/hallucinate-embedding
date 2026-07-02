import { env } from "cloudflare:workers";


const getModel = async()=>{
  try{
    const res = await fetch('https://best-model.api-cloud-flare.workers.dev/');
    const data = await res.json();
    return data.model;
  }catch(e){
    return String(e);
  }
};

const getVec = async(model,text)=>{
  try{
    const resp = await env.AI.run(model, {
      messages: [
        {
          role: "system",
          content: "you behave like and embedding model and return a vector representing the semantic value of provided text. Output exactly 128 floats, range -1 to 1, comma-separated, no words, no explanation. Represent semantic content of input as numbers deterministically."
        },
        { role: "user", content: text }
      ],
      temperature: 0,
      seed: 42
    });
    return resp.response.trim();
  }catch(e){
      try{
        const resp = await env.AI.run(model, {
          messages: [
            {
              role: "system",
              content: "you behave like and embedding model and return a vector representing the semantic value of provided text. Output exactly 128 floats, range -1 to 1, comma-separated, no words, no explanation. Represent semantic content of input as numbers deterministically."
            },
            { role: "user", content: [...new Set(text.split(/\s+/))].join(' ') }
          ],
          temperature: 0,
          seed: 42
        });
        return resp.response.trim();
      }catch(e){
        return String(e);
      }
  }
};

let model;
async function fakeEmbed(text) {
  if(!model){
    model = getModel();
  }
  model = await model;
  const raw = await getVec(model,text);
  const vec = raw.split(",").map(Number);
  const arr = Array(128).fill(0).map((_,i)=>vec[i]||0);
  return arr;
}

export default {
  async fetch(request) {
    let text;
    try{
      if(request.method === 'GET'){
        text = new URL(request.url).searchParams.get('text');
      }else{
        text = await request.text();
      }
    }catch(e){
      text = String(e);
    }
    const result = await fakeEmbed(text);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
  },
};
