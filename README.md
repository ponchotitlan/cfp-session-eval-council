<h1 align="center">✏️ CFP Session Eval Council</h1>
<div align="center">A Multi-Agent Conference CFP (Call for Papers) Session Evaluator</div>
</br>
<div align="center">
<img src="images/cfp-verdict.png"/>
</div>

---

<div align="center">
    </br>
    <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React">
    <img src="https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite">
    <img src="https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js">
    <img src="https://img.shields.io/badge/nginx-009639?style=flat-square&logo=nginx&logoColor=white" alt="nginx">
    <img src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker">
    <img src="https://img.shields.io/badge/Agentic_AI-Multi--Agent-8A2BE2?style=flat-square&logo=sparkles&logoColor=white" alt="Agentic AI">
</div>

---

You have something worth sharing. Conference organisers put real effort into curating sessions that serve their community. **They deserve submissions that are clear, relevant, and well-argued.**

This tool helps you stress-test your abstract before you submit it. Not to game the process, but to make sure your idea comes across the way you intend it to.

Your abstract is put in front of four AI agents, each reading it from a different angle: the person who wrote the call for papers, someone who knows the conference inside out, a programme committee reviewer, and a typical attendee. A fifth agent, the Synthesiser, reads all their outputs and gives you a consolidated report with rewrite suggestions.


## How It Works: The Agent Workflow

You provide your session title, abstract, and the conference's CFP URL. The agents then run in sequence, each building on the work of those before it.

```
analyser [🔍] ──────────────► committee [🎯] ──┐
                              ▲           ├──► synthesiser [🧠]
researcher [📚] ──────────────┘           │
             └──► audience [🙋] ──────────┘
```

### The Agents

| Agent | Role | Inputs | What it produces |
|---|---|---|---|
| 🔍 **CFP Analyser** | Extracts key requirements from the Call for Papers | CFP URL | Themes, formats, audience, hard rules, hidden signals, CFP questions |
| 📚 **Conference Researcher** | Researches past accepted sessions and conference DNA | Event URL | Ethos, accepted talk patterns, rejection signals, trending topics, speaker archetypes |
| 🎯 **Programme Committee Member** | Evaluates from the committee's perspective | Abstract + CFP analysis [🔍] + conference research [📚] | Scores on relevance, originality, clarity, credibility and value; top 3 rejection risks; top 3 edits |
| 🙋 **Audience Member** | Evaluates from the attendee's perspective | Abstract + conference research [📚] | Scores on click-worthiness, clarity and FOMO; most compelling thing; biggest hesitation; title rewrite suggestion |
| 🧠 **Synthesiser** | A senior conference coach | Committee [🎯] + Audience [🙋] evaluations | Composite scores, strengths, weaknesses, 2 title rewrites, full abstract rewrite, 5 ranked edits |

## Deployment

The app runs as two Docker containers managed by Docker Compose:

- **`cfp-session-eval-council-app`**, the React frontend, built with Vite and served by nginx on port `8080`
- **`cfp-session-eval-council-proxy`**, a lightweight Node.js proxy that forwards requests to the Anthropic API

### Requirements

- Docker and Docker Compose installed
- A LLM API key of your choice

### Extra setup

To adjust what the agents say or how they behave, edit [`src/config/prompts.yaml`](/src/config/prompts.yaml) and rebuild the container.

The default port for the web browser is `8080`. You can change it in the [`docker-compose.yml`](/docker-compose.yml) file, under the `cfp-session-eval-council-app` service.

### Running

Clone the project in your host environment:

```bash
git clone https://github.com/ponchotitlan/cfp-session-eval-council
cd cfp-session-eval-council
```

Execute the Docker Compose services within:

```bash
docker compose up --build -d
```

### Stopping

```bash
docker compose down
```

## How to Use

1. Open [http://localhost:8080](http://localhost:8080) in your browser.

2. Click on the **⚙ Settings** panel and setup your LLM API key. This key is stored in your browser's `localStorage`. It is never persisted on the server.

> You can also adjust the delay between agent calls. This delay is required to avoid issues with the LLM API due to several requests from the same call, one after the other.

> Currently supported LLM providers are [Anthropic 🔷](https://console.anthropic.com/settings/keys), [OpenAI 🟢](https://platform.openai.com/api-keys) and [Google Gemini 🔴](https://aistudio.google.com/apikey).

</br>
<div align="center">
<img src="images/cfp-setup.png"/>
</div>
</br>


3. Provide your session's title and abstract, the conference URL and the CfP (Call For Papers) URL. Then Click **⚡ RUN EVALUATION**.

</br>
<div align="center">
<img src="images/cfp-main.png"/>
</div>
</br>
</br>
<div align="center">
<img src="images/cfp-eval.png"/>
</div>
</br>

> If the `analyser` agent cannot fetch the information from the CfP URL, it will prompt you for manual copying/pasting of the CfP details.

</br>
<div align="center">
<img src="images/cfp-details-manual.png"/>
</div>
</br>

4. Once the agents have gathered their conclusions, they will be displayed on each card, along with the Committee Score and Attendee Score.

</br>
<div align="center">
<img src="images/cfp-agent-ethos.png"/></br></br>
<img src="images/cfp-agent-verdict.png"/></div>

5. The section at the bottom of the page will display the global synthesis and recommendations based on the individual verdicts of all the agents of the council.

</br>
<div align="center">
<img src="images/cfp-global-verdict.png"/></br></br>
<img src="images/cfp-conclusions.png"/></br>
</div>

6. You can download a summary by clicking **↓ EXPORT AS .MD**, start again with for a new conference with **← EVALUATE ANOTHER SESSION**, or submit a new session for the same conference by clicking **↩ Try Another Session for This Event**.


### Re-evaluating Another Session for the Same Event

Once you have results, you can click **↩ Try Another Session for This Event**. The Analyser and Researcher outputs are preserved; only the Committee, Audience, and Synthesiser re-run with your new title and abstract. This saves time and API tokens when iterating or evaluating multiple submissions for the same conference.

</br>
<div align="center">
<img src="images/cfp-try-again.png"/>
</div>
</br>

## Behind the Curtains

Check the tech stack, app workflows and other technical details [in this document](ARCHITECTURE.md).

## Roadmap
See the [open issues](https://github.com/ponchotitlan/cfp-session-eval-council/issues) for a list of proposed features (and known issues).

## Contributing
Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are greatly appreciated. For detailed contributing guidelines, please see [CONTRIBUTING.md](CONTRIBUTING.md)

## License
Distributed under the [Apache License 2.0](https://github.com/ponchotitlan/cfp-session-eval-council/blob/main/LICENSE) License. See LICENSE for more information.

## Contact
Alfonso (Poncho) Sandoval - asandovalros@gmail.com

Project Link: https://github.com/ponchotitlan/cfp-session-eval-council

## Acknowledgements
This template was adapted from https://github.com/othneildrew/Best-README-Template.
