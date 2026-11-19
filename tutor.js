const modelo = "Qwen2.5-1.5B-Instruct-q4f32_1-MLC";
const conversacion = document.querySelector("#conversacion");
const pregunta = document.querySelector("#pregunta");
const enviar = document.querySelector("#enviar");
const reiniciar = document.querySelector("#reiniciar");
const aviso = document.querySelector("#aviso");
let motor;
let materiales;
let historial = [];

const palabrasVacias = new Set(
  "como que cual cuales diferencia entre para sobre del las los una uno unos unas con por puedo haces hacer tengo hay esta este esto esos esas ejemplo puedes dame explicame".split(
    " ",
  ),
);

function terminos(texto) {
  return (
    texto
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .match(/[a-z0-9]{3,}/g) ?? []
  )
    .filter((palabra) => !palabrasVacias.has(palabra))
    .map((palabra) => palabra.replace(/(?:es|s)$/, ""));
}

function fragmentos(consulta) {
  const actuales = new Set(terminos(consulta));
  const previos = new Set(terminos(historial.at(-2)?.content ?? ""));
  const candidatos = materiales.flatMap(({ titulo, texto }) =>
    texto
      .match(/[^\n].{0,699}/g)
      .filter((linea) => linea.length >= 45)
      .map((linea) => {
        const palabras = new Set(terminos(titulo + " " + linea));
        let puntos = 0;
        for (const palabra of palabras) {
          if (actuales.has(palabra)) puntos += 3;
          else if (previos.has(palabra)) puntos++;
        }
        return { titulo, linea, puntos };
      }),
  );
  return candidatos
    .sort((a, b) => b.puntos - a.puntos)
    .filter(({ puntos }) => puntos > 0)
    .slice(0, 6);
}

function mostrar(autor, texto) {
  const mensaje = document.createElement("article");
  const nombre = document.createElement("strong");
  const contenido = document.createElement("p");
  nombre.textContent = autor;
  contenido.textContent = texto;
  mensaje.append(nombre, contenido);
  conversacion.append(mensaje);
}

function guardarTurno(texto, respuesta) {
  mostrar("Tú", texto);
  mostrar("Tutor", respuesta);
  historial = [
    { role: "user", content: texto },
    { role: "assistant", content: respuesta.slice(0, 800) },
  ];
  pregunta.value = "";
  aviso.textContent = "";
}

if (!navigator.gpu) {
  enviar.disabled = true;
  aviso.textContent =
    "Este navegador no ofrece WebGPU. Abre el tutor en un dispositivo y navegador compatibles.";
}

document.querySelector("form").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const texto = pregunta.value.trim();
  if (enviar.disabled || !texto) return;

  enviar.disabled = reiniciar.disabled = pregunta.readOnly = true;
  try {
    if (!materiales) {
      const archivo = await fetch("./materiales.json");
      if (!archivo.ok) throw new Error("No se pudieron cargar los materiales");
      materiales = await archivo.json();
    }
    const fuentes = fragmentos(texto);
    if (!fuentes.length) {
      guardarTurno(
        texto,
        "No encuentro un apartado relacionado. Añade un concepto de la unidad o menciona la actividad sobre la que tienes dudas.",
      );
      return;
    }
    if (!motor) {
      aviso.textContent = "Preparando el modelo de IA…";
      const { CreateMLCEngine } =
        await import("https://esm.run/@mlc-ai/web-llm@0.2.89");
      motor = await CreateMLCEngine(modelo, {
        initProgressCallback: ({ progress }) => {
          aviso.textContent =
            "Cargando el modelo… " + Math.round(progress * 100) + " %";
        },
      });
    }
    aviso.textContent = "El tutor está preparando la respuesta…";
    const resultado = await motor.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "Eres el tutor de FAG para la unidad 3. Responde brevemente en español, basándote en el material adjunto. Indica el apartado pertinente. Si falta información, dilo o pide aclaración. Para ejercicios y PE3, ofrece pistas. No inventes entrevistas, encuestas ni resultados.",
        },
        ...historial,
        {
          role: "user",
          content:
            "Material de referencia:\n" +
            fuentes
              .map(({ titulo, linea }) => titulo + "\n" + linea)
              .join("\n\n") +
            "\n\nPregunta:\n" +
            texto,
        },
      ],
      temperature: 0.2,
      max_tokens: 300,
    });
    const respuesta = resultado.choices[0]?.message.content?.trim();
    if (!respuesta) throw new Error("Respuesta vacía");
    guardarTurno(texto, respuesta);
  } catch (error) {
    console.error(error);
    aviso.textContent =
      "No se pudo preparar la respuesta. Comprueba la conexión y la compatibilidad con WebGPU e inténtalo de nuevo.";
  } finally {
    enviar.disabled = reiniciar.disabled = pregunta.readOnly = false;
    pregunta.focus();
  }
});

reiniciar.addEventListener("click", () => {
  historial = [];
  conversacion.replaceChildren();
  pregunta.value = "";
  if (!enviar.disabled) aviso.textContent = "Conversación borrada.";
  pregunta.focus();
});
