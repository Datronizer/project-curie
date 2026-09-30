export interface JobProcessor
{
    processNextPendingJob(): Promise<boolean>;
}

export class IngestionQueueWorker
{
    private isRunning = false;
    private isProcessing = false;
    private timer: NodeJS.Timeout | null = null;

    constructor(
        private processor: JobProcessor,
        private pollIntervalMs: number = 3000
    ) { }

    public start(): void
    {
        if (this.isRunning) return;
        this.isRunning = true;
        this.scheduleNextPoll();
    }

    public stop(): void
    {
        this.isRunning = false;
        if (this.timer)
        {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    public trigger(): void
    {
        if (this.isProcessing) return;
        setImmediate(async () =>
        {
            await this.processNext();
        });
    }

    private scheduleNextPoll(): void
    {
        if (!this.isRunning) return;
        this.timer = setTimeout(async () =>
        {
            await this.processNext();
            this.scheduleNextPoll();
        }, this.pollIntervalMs);
    }

    public async processNext(): Promise<boolean>
    {
        if (this.isProcessing) return false;
        this.isProcessing = true;
        try
        {
            return await this.processor.processNextPendingJob();
        }
        catch (err)
        {
            console.error("[IngestionQueueWorker] Error during job processing cycle:", err);
            return false;
        }
        finally
        {
            this.isProcessing = false;
        }
    }
}
