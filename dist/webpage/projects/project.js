import{Directory}from"../utils/utils.js";class Project{name;dir;constructor(name,dir){this.name=name;this.dir=dir}async createNewAsm(name){await this.dir.setString(name,`.global main
.data
	hello: .asciz "hello world!"

.text
main:
	la a0 hello
	li a7 4
	ecall
	li a7 10
	ecall`);return[name,`.data
	hello: .asciz "hello world!"

.text
main:
	la a0 hello
	li a7 4
	ecall
	li a7 10
	ecall`]}async saveAsm(name,asm){return await this.dir.setString(name,asm)}async *getAsm(){for await(const thing of this.dir.getAllInDir()){if(!(thing[1]instanceof Directory)){yield thing}}}static async new(name){const home=await Directory.home;const dir=await home.getDir(name);return new Project(name,dir)}static async checkName(name){const home=await Directory.home;for await(const[thingName,thing]of home.getAllInDir()){if(thing instanceof Directory){if(thingName===name){return false}}}const proj=await Project.new(name);await proj.createNewAsm("main.asm");return proj}static async *getProjects(){const home=await Directory.home;for await(const[thingName,thing]of home.getAllInDir()){if(thing instanceof Directory){yield new Project(thingName,thing)}}}}export{Project};
//# sourceMappingURL=project.js.map