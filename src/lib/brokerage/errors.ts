export class BrokerageError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "BrokerageError";
    this.status = status;
  }
}
