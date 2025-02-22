import {I18n} from "../i18n.js";

class Console {
	constructor() {}
	consoleArea?: HTMLPreElement;
	messages: (string | ["urgent", string])[] = [];
	io: (string | ["urgent", string])[] = [];
	tab: "messages" | "io" = "io";
	makeHtml() {
		const div = document.createElement("div");
		div.classList.add("flexttb");

		const tabs = document.createElement("div");
		tabs.classList.add("flexltr", "tabStyle");
		div.append(tabs);

		const container = document.createElement("div");
		container.classList.add("flexltr", "consoleContainer");
		div.append(container);

		const clear = document.createElement("button");
		clear.textContent = I18n.Clear();
		container.append(clear);
		this.clearB = clear;

		const consoleArea = document.createElement("pre");
		container.append(consoleArea);
		this.consoleArea = consoleArea;

		const messages = document.createElement("button");
		messages.textContent = I18n.Messages();
		tabs.append(messages);
		this.mButton = messages;
		messages.onclick = () => {
			this.messageBClick();
		};

		this.iButton = document.createElement("button");
		this.iButton.textContent = I18n.runio();
		tabs.append(this.iButton);
		this.iButton.onclick = () => {
			this.messageIClick();
		};
		messages.click();
		return div;
	}
	mButton?: HTMLButtonElement;
	iButton?: HTMLButtonElement;
	clearB?: HTMLButtonElement;
	messageIClick() {
		if (this.tab === "io") return;
		if (!this.consoleArea) return;
		const consoleArea = this.consoleArea;
		if (!this.mButton) return;
		if (!this.clearB) return;
		if (!this.iButton) return;
		consoleArea.innerHTML = "";
		this.iButton.classList.add("selected");
		this.mButton.classList.remove("selected");
		this.tab = "io";
		for (const m of this.io) {
			this.publishIO(m);
		}
		this.clearB.onclick = () => {
			this.io = [];
			consoleArea.innerHTML = "";
		};
	}
	messageBClick() {
		if (this.tab === "messages") return;
		if (!this.consoleArea) return;
		const consoleArea = this.consoleArea;
		if (!this.mButton) return;
		if (!this.clearB) return;
		if (!this.iButton) return;
		consoleArea.innerHTML = "";
		this.mButton.classList.add("selected");
		this.iButton.classList.remove("selected");
		this.tab = "messages";
		for (const m of this.messages) {
			this.publishMessage(m);
		}
		this.clearB.onclick = () => {
			this.messages = [];
			consoleArea.innerHTML = "";
		};
	}
	publishIO(m: string | string[]) {
		if (this.tab !== "io") return;
		if (!this.consoleArea) return;
		if (m instanceof Array) {
			const b = document.createElement("b");
			b.textContent = m[1];
			this.consoleArea.prepend(b, document.createElement("br"));
		} else {
			const lines = m.split("\n");

			const child = this.consoleArea.children[0];
			if (child instanceof HTMLSpanElement && child.textContent) {
				child.textContent += lines.shift();
			}
			for (const line of lines) {
				const span = document.createElement("span");
				span.textContent = line;
				this.consoleArea.prepend(span);
			}
		}
	}
	addIO(content: string, urgent = false) {
		if (urgent) {
			this.messageIClick();
			this.io.push(["urgent", content]);
			this.publishIO(["urgent", content]);
		} else {
			this.io.push(content);
			this.publishIO(content);
		}
	}
	publishMessage(m: string | string[]) {
		if (this.tab !== "messages") return;
		if (!this.consoleArea) return;
		if (m instanceof Array) {
			const b = document.createElement("b");
			b.textContent = m[1];
			this.consoleArea.prepend(b, document.createElement("br"));
		} else {
			const lines = m.split("\n");
			const child = this.consoleArea.children[0];
			if (child instanceof HTMLSpanElement && child.textContent) {
				child.textContent += lines.shift();
			}
			for (const line of lines) {
				const span = document.createElement("span");
				span.textContent = line;
				this.consoleArea.prepend(span);
			}
		}
	}
	addMessage(content: string, urgent = false) {
		if (urgent) {
			this.messageBClick();
			this.messages.push(["urgent", content]);
			this.publishMessage(["urgent", content]);
		} else {
			this.messages.push(content);
			this.publishMessage(content);
		}
	}
}
export {Console};
