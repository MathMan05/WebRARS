type argumentTypes = "reg" | "offreg" | "label" | "12bit" | "20bit" | "hilabel" | "freg";
const registerNames = (await (await fetch("./assembler/registerNames.json")).json()) as {
	int: string[][];
	float: string[][];
};

type instructionType =
	| {
			name: string;
			type: "fake";
			replace: string;
			args: argumentTypes[];
	  }
	| {
			name: string;
			type: "veryfake";
	  }
	| {
			name: string;
			type: "I";
			args: ["reg" | "freg", "offreg"] | ["reg" | "freg", "reg" | "freg", "12bit"];
			funct3: number;
			opcode: number;
			pimm?: number;
	  }
	| {
			name: string;
			type: "W";
			args: [];
			code: number;
	  }
	| {
			name: string;
			type: "R";
			args: ["reg" | "freg", "reg" | "freg", "reg" | "freg"];
			opcode: number;
			funct7: number;
			funct3: number;
	  }
	| {
			name: string;
			type: "S";
			args: ["reg" | "freg", "offreg"];
			funct3: number;
			opcode: number;
	  }
	| {
			name: string;
			type: "B";
			args: ["reg" | "freg", "reg" | "freg", "label"];
			funct3: number;
			opcode: number;
	  }
	| {
			name: string;
			type: "J";
			args: ["reg", "label"];
			opcode: number;
	  }
	| {
			name: string;
			type: "U";
			args: ["reg" | "freg", "20bit" | "hilabel" | "label"];
			opcode: number;
	  }
	| {
			name: string;
			type: "reallyfake";
	  };

const instructions = (await (
	await fetch("./assembler/instructions.json")
).json()) as instructionType[];

export {registerNames, instructions};
