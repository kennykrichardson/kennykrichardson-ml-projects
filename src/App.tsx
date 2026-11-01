import ParticleNetwork from "./ParticleNetwork";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronUp, BookOpen, Code2, FileCode2, Search, LayoutGrid, List, Github, NotebookText, ExternalLink } from "lucide-react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import DOMPurify from "dompurify";
import { codeToHtml } from "shiki";

type Project = {
  id: string; name: string; description: string; language: string;
  type: "Jupyter Notebook" | "Python"; category: string;
  file?: string; repo: string; topics: string[]; notebookUrl?: string;
};

const projects: Project[] = [
  {
    id: "synchrogrid", name: "SynchroGrid Multi-Agent Traffic Optimization",
    description: "Adaptive multi-agent traffic simulation comparing fixed, adaptive, and pressure-based traffic control strategies, including congestion, routing, and emergency vehicles.",
    language: "Python · Multi-Agent Systems", type: "Jupyter Notebook", category: "Simulation",
    file: "SynchroGrid.ipynb", repo: "SynchroGrid-Multi-Agent-Traffic-Optimization",
    topics: ["Multi-Agent Systems", "Traffic Optimization", "Simulation"]
  },
  {
    id: "axiom", name: "Axiom Adversarial Evidence Reconstruction Engine",
    description: "A machine-learning and reasoning experiment that reconstructs coherent explanations from noisy, contradictory, duplicated, and adversarial evidence.",
    language: "Python · Machine Learning", type: "Jupyter Notebook", category: "Reasoning",
    file: "axiom.ipynb", repo: "Axiom-Adversarial-Evidence-Reconstruction-Engine",
    topics: ["Evidence Reconstruction", "Reasoning", "Adversarial Analysis"]
  },
  {
    id: "phisherman", name: "Phisherman Phishing Website Detector",
    description: "A machine-learning project that uses URL feature engineering to identify potentially malicious websites and distinguish them from legitimate ones.",
    language: "Python · Scikit-learn", type: "Jupyter Notebook", category: "Classification",
    file: "Phishing_Website_Detector.ipynb", repo: "Phisherman-Phishing-Website-Detector",
    topics: ["Cybersecurity", "Classification", "Random Forest"]
  },
  {
    id: "boxwit", name: "Boxwit ML-Ops Pipeline",
    description: "A reproducible machine-learning pipeline that predicts whether a movie is likely to receive an IMDb rating of 7.0 or higher, with feature engineering and model evaluation.",
    language: "Python · Scikit-learn", type: "Jupyter Notebook", category: "MLOps",
    file: "boxwit-run.py", repo: "BoxWit-MLOps-Pipeline",
    topics: ["Random Forest", "Feature Engineering", "MLOps"]
  },
  {
    id: "drone-fleet", name: "Drone-Fleet-Optimization",
    description: "An autonomous drone delivery simulation using RRT* path planning, payload constraints, randomized environments, and no-fly-zone avoidance.",
    language: "Python · Path Planning", type: "Jupyter Notebook", category: "Optimization",
    file: "DroneFleet_Optimizer.ipynb", repo: "Drone-Fleet-Optimization",
    topics: ["RRT*", "Path Planning", "Optimization"]
  }
];

const rawBase = "/notebooks/";

function Header() {
  return <header className="topbar">
    <div className="brand">⬡ Kenny Richardson's ML Projects</div>
    <p className="tagline">Your machine learning experiments, properly presented.</p>
  </header>;
}

function ProjectRow({ project, view }: { project: Project; view: "list" | "grid" }) {
  const isNotebook = project.type === "Jupyter Notebook";
  return <article className={`project-row ${view === "grid" ? "project-card" : ""}`}>
    <div className="project-heading">
      <Link to={`/project/${project.id}`} className="project-title">{project.name}</Link>
      <Link className="open-project" to={`/project/${project.id}`}><span>Open experiment</span><ExternalLink className="action-icon" size={14} strokeWidth={2.1}/></Link>
    </div>
    <p className="description">{project.category} · {project.language}</p>
    <p className="project-summary">{project.description}</p>
    <div className="project-bottom">
      <span className="notebook-label">{isNotebook ? "JUPYTER NOTEBOOK" : "PYTHON SOURCE"}</span>
      {isNotebook
        ? <span className="status executed">Executed</span>
        : <span className="status source-status">Python</span>}
    </div>
  </article>;
}

function Home() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [view, setView] = useState<"list" | "grid">("list");
  const listRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState<number | "auto">("auto");

  const categories = ["All", "Classification", "Simulation", "Optimization", "MLOps", "Reasoning"];
  const filtered = useMemo(() => projects.filter(project => {
    const matchesFilter = filter === "All" || project.category === filter;
    const q = query.toLowerCase().trim();
    return matchesFilter && `${project.name} ${project.description} ${project.topics.join(" ")} ${project.language}`.toLowerCase().includes(q);
  }), [query, filter]);

  useLayoutEffect(() => {
    if (listRef.current) setListHeight(listRef.current.scrollHeight);
  }, [filtered.length, query, filter, view]);

  return <div className="page-shell home-shell">
    <Header />
    <main className="repo-section home-content">
      <h2>Explore projects</h2>
      <div className="toolbar">
        <label className="search-box">
          <Search size={15} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search experiments..." aria-label="Search experiments" />
          {query && <button onClick={() => setQuery("")} aria-label="Clear search">×</button>}
        </label>
        <div className="toolbar-controls">
          <div className="filters" aria-label="Filter projects">
            {categories.map(category => <button key={category} className={`filter category-${category.toLowerCase()}${filter === category ? " active" : ""}`} aria-pressed={filter === category} onClick={() => setFilter(category)}>{category}</button>)}
          </div>
          <div className="view-toggle" role="group" aria-label="Project layout">
            <button className={view === "list" ? "view-button active" : "view-button"} onClick={() => setView("list")} aria-label="List view" aria-pressed={view === "list"} title="List view"><List size={14}/></button>
            <button className={view === "grid" ? "view-button active" : "view-button"} onClick={() => setView("grid")} aria-label="Grid view" aria-pressed={view === "grid"} title="Grid view"><LayoutGrid size={14}/></button>
          </div>
        </div>
      </div>
      <div
        className="project-list-viewport"
        style={{ height: listHeight === "auto" ? "auto" : `${listHeight}px` }}
        aria-live="polite"
      >
        <div className={`project-list ${view === "grid" ? "project-grid" : "project-list-mode"}`} ref={listRef} key={`${filter}-${query}-${view}`}>
          {filtered.map(project => <ProjectRow key={project.id} project={project} view={view} />)}
          {filtered.length === 0 && <div className="empty">No experiments match your search.</div>}
        </div>
      </div>
    </main>
    <footer className="footer"><span>⚛ Kenny Richardson's ML Projects • </span><span>{filtered.length} of {projects.length} experiments</span></footer>
  </div>;
}

type Cell = { cell_type: string; source: string[] | string; execution_count?: number | null; outputs?: any[] };
type Notebook = { cells: Cell[]; metadata?: any; nbformat?: number };

function sourceText(source: string[] | string = "") { return Array.isArray(source) ? source.join("") : source; }

async function highlight(code: string) {
  try { return await codeToHtml(code, { lang: "python", theme: "github-dark" }); }
  catch { return `<pre><code>${code.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</code></pre>`; }
}

function NotebookCode({ code }: { code: string }) {
  const [html, setHtml] = useState("");
  useEffect(() => { let live = true; highlight(code).then(value => { if (live) setHtml(value); }); return () => { live = false; }; }, [code]);
  return <div className="code-frame">
    <div className="cell-toolbar"><span><Code2 size={12}/> Python</span><button onClick={() => navigator.clipboard?.writeText(code)}>Copy code</button></div>
    {html ? <div className="code-content" dangerouslySetInnerHTML={{ __html: html }}/> : <pre className="code-loading">{code}</pre>}
  </div>;
}

function NotebookOutput({ output }: { output: any }) {
  const data = output?.data ?? {};
  if (data["image/png"]) {
    const image = Array.isArray(data["image/png"]) ? data["image/png"].join("") : data["image/png"];
    return <div className="output-image"><img src={`data:image/png;base64,${image}`} alt="Notebook output"/></div>;
  }
  if (data["image/jpeg"]) {
    const image = Array.isArray(data["image/jpeg"]) ? data["image/jpeg"].join("") : data["image/jpeg"];
    return <div className="output-image"><img src={`data:image/jpeg;base64,${image}`} alt="Notebook output"/></div>;
  }
  if (data["text/html"]) {
    const html = Array.isArray(data["text/html"]) ? data["text/html"].join("") : data["text/html"];
    return <div className="html-output" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}/>;
  }
  const text = data["text/plain"] ?? output?.text ?? output?.traceback?.join("\n");
  if (text) return <pre className="plain-output">{Array.isArray(text) ? text.join("") : text}</pre>;
  return null;
}

function NotebookViewer({ file }: { file: string }) {
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const project = projects.find(item => item.file === file);
    const candidates = [`${rawBase}${file}`, ...(project?.notebookUrl ? [project.notebookUrl] : [])];

    const loadNotebook = async () => {
      let lastError: Error | null = null;
      for (const url of candidates) {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Notebook request failed (${response.status}).`);
          const body = await response.text();
          // Static hosts often return index.html for a missing asset. Don't feed that to JSON.parse.
          if (!body.trimStart().startsWith("{")) throw new Error("The notebook URL returned HTML instead of an .ipynb JSON file.");
          const parsed = JSON.parse(body) as Notebook;
          if (!Array.isArray(parsed.cells)) throw new Error("The file is JSON, but it is not a valid Jupyter notebook.");
          if (live) { setNotebook(parsed); setError(""); }
          return;
        } catch (cause) {
          lastError = cause instanceof Error ? cause : new Error("Notebook could not be loaded.");
        }
      }
      if (live) setError(lastError?.message ?? "Notebook file could not be loaded.");
    };
    loadNotebook();
    return () => { live = false; };
  }, [file]);
  if (error) return <div className="load-error">{error}</div>;
  if (!notebook) return <div className="loading">Loading notebook…</div>;
  return <div className="notebook-document">
    {notebook.cells.map((cell, index) => {
      const source = sourceText(cell.source);
      if (cell.cell_type === "markdown") return <section className="markdown-cell" key={index}>
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{source}</ReactMarkdown>
      </section>;
      if (cell.cell_type === "code") return <section className="notebook-code-cell" key={index}>
        <div className="cell-number">In&nbsp; [{cell.execution_count ?? " "}]:</div>
        <div className="cell-body">
          <NotebookCode code={source}/>
          {cell.outputs?.map((output, i) => <div className="notebook-output" key={i}><NotebookOutput output={output}/></div>)}
        </div>
      </section>;
      return null;
    })}
  </div>;
}

function PythonViewer({ file }: { file: string }) {
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [html, setHtml] = useState("");
  useEffect(() => {
    fetch(`/source/${file}`).then(r => { if (!r.ok) throw new Error("Source file could not be loaded."); return r.text(); })
      .then(async value => { setSource(value); setHtml(await highlight(value)); })
      .catch(e => setError(e.message));
  }, [file]);
  if (error) return <div className="load-error">{error}</div>;
  return <div className="code-frame source-view"><div className="cell-toolbar"><span><FileCode2 size={12}/> Python source</span><button onClick={() => navigator.clipboard?.writeText(source)}>Copy code</button></div>{html ? <div className="code-content" dangerouslySetInnerHTML={{__html:html}}/> : <div className="loading">Loading source…</div>}</div>;
}


function BoxwitResults() {
  const result = {
    accuracy: 0.76385,
    precision: 0.5849634065202928,
    recall: 0.7326666666666667,
    f1: 0.6505364409914909,
    rocAuc: 0.8357694107142857,
    baseline: 0.7,
    runtime: 15.528,
    rows: 100000,
    train: 80000,
    test: 20000,
    tn: 10881,
    fp: 3119,
    fn: 1604,
    tp: 4396,
  };
  const percent = (value: number) => `${(value * 100).toFixed(2)}%`;
  const metricCards = [
    { label: "Accuracy", value: percent(result.accuracy), note: `+${((result.accuracy - result.baseline) * 100).toFixed(2)} pp vs baseline` },
    { label: "ROC-AUC", value: result.rocAuc.toFixed(3), note: "Ranking performance" },
    { label: "F1 score", value: result.f1.toFixed(3), note: "Precision / recall balance" },
    { label: "Runtime", value: `${result.runtime.toFixed(2)}s`, note: "Recorded pipeline run" },
  ];
  return <section className="boxwit-results">
    <div className="results-heading">
      <div>
        <span className="results-eyebrow">RECORDED EXPERIMENT · EXP-002</span>
        <h2>Pipeline results</h2>
        <p>Random Forest classifier predicting whether a movie reaches an IMDb rating of 7.0 or higher.</p>
      </div>
      <span className="results-model">Random Forest · 300 trees</span>
    </div>

    <div className="results-metrics">
      {metricCards.map(metric => <div className="results-metric" key={metric.label}>
        <span>{metric.label}</span>
        <strong>{metric.value}</strong>
        <small>{metric.note}</small>
      </div>)}
    </div>

    <div className="results-grid">
      <section className="results-panel">
        <div className="results-panel-title">
          <h3>Confusion matrix</h3>
          <span>20,000 test samples</span>
        </div>
        <div className="matrix">
          <div className="matrix-axis matrix-empty"/>
          <div className="matrix-axis">Predicted 0</div>
          <div className="matrix-axis">Predicted 1</div>
          <div className="matrix-axis">Actual 0</div>
          <div className="matrix-cell true-negative"><strong>{result.tn.toLocaleString("en-US")}</strong><small>True negative</small></div>
          <div className="matrix-cell false-positive"><strong>{result.fp.toLocaleString("en-US")}</strong><small>False positive</small></div>
          <div className="matrix-axis">Actual 1</div>
          <div className="matrix-cell false-negative"><strong>{result.fn.toLocaleString("en-US")}</strong><small>False negative</small></div>
          <div className="matrix-cell true-positive"><strong>{result.tp.toLocaleString("en-US")}</strong><small>True positive</small></div>
        </div>
        <p className="results-footnote">Class 1 represents movies rated 7.0 or higher.</p>
      </section>

      <section className="results-panel">
        <div className="results-panel-title"><h3>Model vs baseline</h3><span>Accuracy</span></div>
        <div className="accuracy-comparison">
          <div className="accuracy-row">
            <div><span>Majority-class baseline</span><strong>{percent(result.baseline)}</strong></div>
            <div className="accuracy-track"><i style={{ width: percent(result.baseline) }}/></div>
          </div>
          <div className="accuracy-row">
            <div><span>Random Forest</span><strong>{percent(result.accuracy)}</strong></div>
            <div className="accuracy-track"><i className="model-bar" style={{ width: percent(result.accuracy) }}/></div>
          </div>
        </div>
        <div className="secondary-metrics">
          <div><span>Precision</span><strong>{percent(result.precision)}</strong></div>
          <div><span>Recall</span><strong>{percent(result.recall)}</strong></div>
          <div><span>F1 score</span><strong>{result.f1.toFixed(3)}</strong></div>
        </div>
      </section>
    </div>

    <div className="results-run-meta">
      <div><span>Dataset</span><strong>{result.rows.toLocaleString("en-US")} rows</strong></div>
      <div><span>Train / test split</span><strong>{result.train.toLocaleString("en-US")} / {result.test.toLocaleString("en-US")}</strong></div>
      <div><span>Features before encoding</span><strong>11</strong></div>
      <div><span>Class distribution</span><strong>70% negative · 30% positive</strong></div>
    </div>
    <p className="results-disclaimer">Values are taken from the uploaded Boxwit <code>metrics.json</code> and recorded pipeline log. These are saved experiment results, not a live inference run.</p>
  </section>;
}

function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () => setVisible(window.scrollY > 480);
    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateVisibility);
  }, []);

  if (!visible) return null;

  const scrollToTop = () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return createPortal(
    <button
      className="scroll-to-top"
      type="button"
      onClick={scrollToTop}
      aria-label="Scroll to top"
      title="Back to top"
    >
      <ChevronUp size={25} strokeWidth={3.2} />
    </button>,
    document.body
  );
}

function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const project = projects.find(p => p.id === id);
  if (!project) return <div className="page-shell"><Header/><div className="not-found"><h2>Project not found</h2><Link to="/">Back to projects</Link></div></div>;
  const notebook = project.type === "Jupyter Notebook";
  return <div className="page-shell detail-shell">
    <Header/>
    <main>
      <button className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={14}/> Back to projects</button>
      <div className="detail-heading">
        <div className="detail-title-line"><h1>{project.name}</h1></div>
        <p>{project.description}</p>
        <div className="detail-meta">
          <span className={notebook ? "language notebook" : "language python"}><span className="language-dot"/>{project.language}</span>
          <a className="detail-action github-action" href={`https://github.com/kennykrichardson/${project.repo}`} target="_blank" rel="noreferrer"><Github size={16} strokeWidth={2}/><span>View source on GitHub</span><ExternalLink className="action-external" size={12}/></a>
          <a className="detail-action download-action" href={notebook ? (project.notebookUrl ?? `${rawBase}${project.file}`) : `/source/${project.file}`} download><NotebookText size={16} strokeWidth={2}/><span>Download {notebook ? "notebook" : "source"}</span><ExternalLink className="action-external" size={12}/></a>
        </div>
        <div className="topics">{project.topics.map(topic => <span key={topic}>{topic}</span>)}</div>
      </div>
      {project.id === "boxwit" && <BoxwitResults />}
      <div className="file-heading"><div><BookOpen size={15}/><strong>{project.file}</strong></div><span>{notebook ? "Executed notebook · saved outputs" : "Python source file"}</span></div>
      {notebook ? <NotebookViewer file={project.file!}/> : <PythonViewer file={project.file!}/>}
      <ScrollToTopButton />
    </main>
    <footer className="footer"><span>⚛ Kenny Richardson's ML Projects • </span><Link to="/">All projects</Link></footer>
  </div>;
}

export default function App() {
  return (
    <>
      <ParticleNetwork opacity={0.9} speed={0.65} density={1} />
      <div className="particle-network-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/project/:id" element={<ProjectDetail />} />
        </Routes>
      </div>
    </>
  );
}
