"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { GitMerge } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  departments,
  getUsersByDepartment,
  type RoutingPayload,
} from "@/lib/workflow-mock";

const formSchema = z.object({
  department: z.string().min(1, { message: "Please select a department." }),
  assigneeUserId: z
    .string()
    .min(1, { message: "Please select a user to receive the document." }),
  priority: z.string().min(1, { message: "Please select a priority." }),
  note: z.string().optional(),
});

export type { RoutingPayload };

interface WorkflowRoutingFormProps {
  documentId?: string;
  onSuccess?: (payload?: RoutingPayload) => void;
  routingHistory?: { departmentId: string }[];
}

export function WorkflowRoutingForm({
  documentId,
  onSuccess,
}: WorkflowRoutingFormProps) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      department: "",
      assigneeUserId: "",
      priority: "normal",
      note: "",
    },
  });

  const selectedDepartment = form.watch("department");

  useEffect(() => {
    if (selectedDepartment) {
      form.setValue("assigneeUserId", "");
    }
  }, [selectedDepartment, form]);

  function onSubmit(values: z.infer<typeof formSchema>) {
    const dept = departments.find((d) => d.id === values.department);
    const users = getUsersByDepartment(values.department);
    const user = users.find((u) => u.id === values.assigneeUserId);
    if (!dept || !user) {
      form.setError("assigneeUserId", {
        message: "Please select a valid department and user.",
      });
      return;
    }
    const payload: RoutingPayload = {
      departmentId: dept.id,
      departmentName: dept.name,
      userId: user.id,
      userName: user.name,
      priority: values.priority,
      note: values.note,
    };
    console.log("Route document:", documentId, payload);
    form.reset({ department: "", assigneeUserId: "", priority: "normal", note: "" });
    onSuccess?.(payload);
  }

  const usersInDept = selectedDepartment
    ? getUsersByDepartment(selectedDepartment)
    : [];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
          <div className="bg-blue-100 p-2 rounded-full">
            <GitMerge className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700">
              Route for Department Review
            </p>
            <p className="text-xs text-slate-500">
              Forward this document to a department and assign a recipient.
            </p>
          </div>
        </div>

        <FormField
          control={form.control}
          name="department"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Assign To Department</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="assigneeUserId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Assign To User</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value}
                disabled={!selectedDepartment || usersInDept.length === 0}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        !selectedDepartment
                          ? "Select department first"
                          : "Select user to receive document"
                      }
                    />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {usersInDept.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="priority"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Priority</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Note <span className="text-slate-400 font-normal">(optional)</span>
              </FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Add any routing notes or instructions..."
                  className="resize-none"
                  rows={3}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
          <GitMerge className="mr-2 h-4 w-4" />
          Forward to Department
        </Button>
      </form>
    </Form>
  );
}
