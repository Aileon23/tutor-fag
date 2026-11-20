const modelo = "Qwen2.5-1.5B-Instruct-q4f32_1-MLC";
const conversacion = document.querySelector("#conversacion");
const pregunta = document.querySelector("#pregunta");
const enviar = document.querySelector("#enviar");
const reiniciar = document.querySelector("#reiniciar");
const aviso = document.querySelector("#aviso");
let motor;
const unidad = document.querySelector("#unidad");
const fuenteUnidad = document.querySelector("#fuente-unidad");
const materialesPorUnidad = new Map();
let historial = [];

const palabrasVacias = new Set(
  "como que cual cuales diferencia entre para sobre del las los una uno unos unas con por puedo haces hacer tengo hay esta este esto esos esas ejemplo puedes dame explicame".split(
    " ",
  ),
);

function normalizar(texto) {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function terminos(texto) {
  return (normalizar(texto).match(/[a-z0-9]{3,}/g) ?? [])
    .filter((palabra) => !palabrasVacias.has(palabra))
    .map((palabra) => palabra.replace(/(?:es|s)$/, ""));
}

function fragmentos(consulta, materiales) {
  const frase = normalizar(consulta)
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
  const actuales = new Set(terminos(consulta));
  const previos = new Set(terminos(historial.at(-2)?.content ?? ""));
  const candidatos = materiales.flatMap(({ titulo, texto }) =>
    texto
      .match(/[^\n].{0,699}/g)
      ?.map((linea) => linea.trim())
      .filter((linea) => linea.length >= 25)
      .map((linea) => {
        const palabras = new Set(terminos(titulo + " " + linea));
        let puntos =
          frase.length >= 12 && normalizar(titulo).includes(frase) ? 6 : 0;
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

  const numero = unidad.value;
  aviso.textContent = "Buscando en los materiales de la unidad…";
  unidad.disabled =
    enviar.disabled =
    reiniciar.disabled =
    pregunta.readOnly =
      true;
  try {
    if (!materialesPorUnidad.has(numero)) {
      const archivo = await fetch(`./materiales/unidad${numero}.json`);
      if (!archivo.ok) throw new Error("No se pudieron cargar los materiales");
      materialesPorUnidad.set(numero, await archivo.json());
    }
    const fuentes = fragmentos(texto, materialesPorUnidad.get(numero));
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
          content: `Eres el tutor de Fundamentos de Administración y Gestión para la unidad ${numero}. Responde brevemente en español, basándote en el material adjunto. Indica el apartado pertinente. Si falta información, dilo o pide aclaración. Para ejercicios y tareas del Plan de Empresa, ofrece pistas. No inventes datos ni resultados.`,
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
    unidad.disabled =
      enviar.disabled =
      reiniciar.disabled =
      pregunta.readOnly =
        false;
    pregunta.focus();
  }
});

function borrarConversacion() {
  historial = [];
  conversacion.replaceChildren();
  pregunta.value = "";
}

reiniciar.addEventListener("click", () => {
  borrarConversacion();
  if (!enviar.disabled) aviso.textContent = "Conversación borrada.";
  pregunta.focus();
});

unidad.addEventListener("change", () => {
  borrarConversacion();
  fuenteUnidad.hidden = unidad.value !== "1";
  if (!enviar.disabled)
    aviso.textContent = "Unidad seleccionada. Escribe tu pregunta.";
});
