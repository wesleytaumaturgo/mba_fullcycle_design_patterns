// Convenção dos callbacks registrados em `on` (o tipo `Function` não a expressa):
// o adapter os invoca com quatro argumentos, sempre nesta ordem:
//   1. params  - parâmetros da rota
//   2. body    - corpo da requisição
//   3. headers - cabeçalhos da requisição
//   4. query   - query string, como objeto simples chave/valor de texto (sem tipo do framework)
// Quando o callback devolve uma string, a resposta é texto puro; objeto ou array vão como JSON.
export default interface HttpServer {
	on (method: string, url: string, callback: Function): void;
	listen (port: number): void;
}
